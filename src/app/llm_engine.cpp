// ============================================================================
// llm_engine.cpp - Motor de inferencia LLM via llama.cpp
// ============================================================================
// Carga modelos GGUF directamente - NO usa Ollama.
// Soporta CUDA nativo via ggml backend.
// ============================================================================
#include "alfred/llm_engine.h"
#include "alfred/logger.h"

#include "llama.h"

#include <chrono>
#include <cstring>
#include <algorithm>
#include <thread>
#include <filesystem>
#include <mutex>

namespace alfred {

static ggml_type parse_cache_type(const std::string& s) {
    if (s == "q8_0") return GGML_TYPE_Q8_0;
    if (s == "q4_0") return GGML_TYPE_Q4_0;
    if (s == "q5_0") return GGML_TYPE_Q5_0;
    if (s == "q5_1") return GGML_TYPE_Q5_1;
    if (s == "q4_1") return GGML_TYPE_Q4_1;
    return GGML_TYPE_F16;
}

static llama_flash_attn_type to_flash_attn(int v) {
    if (v == 0) return LLAMA_FLASH_ATTN_TYPE_DISABLED;
    if (v == 1) return LLAMA_FLASH_ATTN_TYPE_ENABLED;
    return LLAMA_FLASH_ATTN_TYPE_AUTO;
}

// Lee un metadato GGUF (string) del modelo cargado. Devuelve "" si no existe.
static std::string read_meta_str(const llama_model* m, const std::string& key) {
    if (!m) return "";
    char buf[256];
    int n = llama_model_meta_val_str(m, key.c_str(), buf, sizeof(buf));
    if (n <= 0) return "";
    return std::string(buf, static_cast<size_t>(n));
}

int LLMEngine::detect_head_dim_k() const {
    if (!model_) return 0;

    // Path preferido: metadato '<arch>.attention.key_length'. Soporta modelos
    // donde head_dim != n_embd / n_head (Gemma 3/4, MQA con dimensiones custom).
    std::string arch = read_meta_str(model_, "general.architecture");
    if (!arch.empty()) {
        std::string v = read_meta_str(model_, arch + ".attention.key_length");
        if (!v.empty()) {
            try { return std::stoi(v); } catch (...) {}
        }
    }

    // Fallback: estimacion clasica n_embd / n_head. Vale para Llama, Mistral,
    // Qwen, Phi y la mayoria de arquitecturas que no expongan key_length.
    int n_embd = llama_model_n_embd(model_);
    int n_head = llama_model_n_head(model_);
    if (n_embd > 0 && n_head > 0) return n_embd / n_head;
    return 0;
}

LLMEngine::LLMEngine() = default;

LLMEngine::~LLMEngine() {
    cleanup();
}

LLMEngine::LLMEngine(LLMEngine&& other) noexcept
    : model_(other.model_), ctx_(other.ctx_),
      config_(std::move(other.config_)),
      model_name_(std::move(other.model_name_)) {
    other.model_ = nullptr;
    other.ctx_ = nullptr;
}

LLMEngine& LLMEngine::operator=(LLMEngine&& other) noexcept {
    if (this != &other) {
        cleanup();
        model_ = other.model_;
        ctx_ = other.ctx_;
        config_ = std::move(other.config_);
        model_name_ = std::move(other.model_name_);
        other.model_ = nullptr;
        other.ctx_ = nullptr;
    }
    return *this;
}

void LLMEngine::cleanup() {
    if (ctx_) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_) {
        llama_model_free(model_);
        model_ = nullptr;
    }
    last_tokens_.clear();
}

bool LLMEngine::load_model(const LLMConfig& config) {
    cleanup();
    config_ = config;
    last_error_.clear();

    static std::once_flag llama_backend_once;
    std::call_once(llama_backend_once, []() {
        log_info("Inicializando backend llama.cpp/ggml...");
        llama_backend_init();
        log_info("Backend llama.cpp inicializado correctamente");
    });

    const bool gpu_offload_supported = llama_supports_gpu_offload();

    log_info("Cargando modelo LLM: " + config.model_path);
    log_info("  Requested GPU layers: " + std::to_string(config.n_gpu_layers));
    log_info("  llama_supports_gpu_offload: " + std::string(gpu_offload_supported ? "YES" : "NO"));
    log_info("  Context: " + std::to_string(config.n_ctx));
    log_info("  Batch: " + std::to_string(config.n_batch));

    if (config.n_gpu_layers > 0 && !gpu_offload_supported) {
        log_warn("GPU offload solicitado pero backend reporta soporte GPU OFF. Se puede usar CPU fallback.");
    }

    // Verificar que el archivo existe y es accesible
    {
        std::error_code ec;
        auto fsize = std::filesystem::file_size(config.model_path, ec);
        if (ec) {
            last_error_ = "No se pudo acceder al archivo: " + ec.message();
            log_error(last_error_ + " (" + config.model_path + ")");
            return false;
        }
        log_info("  Archivo: " + std::to_string(fsize / (1024*1024)) + " MB");
    }

    // Parametros del modelo
    auto model_params = llama_model_default_params();
    model_params.n_gpu_layers = config.n_gpu_layers;
    model_params.use_mmap     = config.use_mmap;
    model_params.use_mlock    = config.use_mlock;

    auto start = std::chrono::steady_clock::now();

    model_ = llama_model_load_from_file(config.model_path.c_str(), model_params);
    if (!model_) {
        last_error_ = "llama.cpp no pudo cargar el modelo. Puede ser un archivo GGUF invalido, "
                       "corrupto, o memoria insuficiente (GPU layers: " +
                       std::to_string(config.n_gpu_layers) + ")";
        log_error(last_error_ + " (" + config.model_path + ")");
        return false;
    }

    const int model_layers = llama_model_n_layer(model_);
    int effective_gpu_layers = 0;
    if (gpu_offload_supported && config.n_gpu_layers != 0) {
        if (config.n_gpu_layers < 0) {
            effective_gpu_layers = model_layers;
        } else {
            effective_gpu_layers = std::min(config.n_gpu_layers, model_layers);
        }
    }
    log_info("  Model layers total: " + std::to_string(model_layers));
    log_info("  Effective GPU layers (estimado): " + std::to_string(effective_gpu_layers));

    // Parametros del contexto
    auto ctx_params = llama_context_default_params();
    ctx_params.n_ctx           = static_cast<uint32_t>(config.n_ctx);
    ctx_params.n_batch         = static_cast<uint32_t>(config.n_batch);
    ctx_params.n_ubatch        = config.n_ubatch > 0
        ? static_cast<uint32_t>(config.n_ubatch)
        : static_cast<uint32_t>(config.n_batch);

    // FlashAttention en CUDA solo soporta head_dim hasta 256. Modelos con
    // head_dim mayor (p.ej. Gemma 4 E4B usa 512) abortan dentro de
    // llama_init_from_model si pedimos auto/on. Detectamos head_dim leyendo
    // el metadato GGUF '<arch>.attention.key_length' y, si supera 256,
    // forzamos OFF aunque el usuario haya pedido otra cosa.
    int requested_fa = config.flash_attn;
    int head_dim_k = detect_head_dim_k();
    if (head_dim_k > 0) {
        log_info("  Model head_dim (K): " + std::to_string(head_dim_k));
    }
    if (head_dim_k > 256 && requested_fa != 0) {
        log_warn("FlashAttention deshabilitado: head_dim=" + std::to_string(head_dim_k) +
                 " supera lo soportado por el kernel CUDA (256).");
        requested_fa = 0;
    }
    ctx_params.flash_attn_type = to_flash_attn(requested_fa);
    ctx_params.offload_kqv     = config.offload_kqv;
    ctx_params.type_k          = parse_cache_type(config.cache_type_k);
    ctx_params.type_v          = parse_cache_type(config.cache_type_v);

    // Threads: si es 0, usar cores fisicos (logicos / 2, minimo 4)
    int threads = config.n_threads;
    if (threads <= 0) {
        int hw = static_cast<int>(std::thread::hardware_concurrency());
        threads = std::max(4, hw / 2);
    }
    int threads_batch = config.n_threads_batch > 0
        ? config.n_threads_batch
        : threads;
    ctx_params.n_threads       = static_cast<int32_t>(threads);
    ctx_params.n_threads_batch = static_cast<int32_t>(threads_batch);
    log_info("  Threads CPU: " + std::to_string(threads));
    log_info("  flash_attn: " + std::string(llama_flash_attn_type_name(ctx_params.flash_attn_type)));
    log_info("  offload_kqv: " + std::string(config.offload_kqv ? "true" : "false"));
    log_info("  KV cache K/V: " + config.cache_type_k + "/" + config.cache_type_v);
    log_info("  n_ubatch: " + std::to_string(ctx_params.n_ubatch));
    log_info("  n_threads_batch: " + std::to_string(threads_batch));

    ctx_ = llama_init_from_model(model_, ctx_params);
    if (!ctx_) {
        last_error_ = "Error creando contexto LLM (n_ctx=" + std::to_string(config.n_ctx) +
                       "). Puede que el modelo no soporte este tamano de contexto o no haya "
                       "suficiente memoria";
        log_error(last_error_);
        llama_model_free(model_);
        model_ = nullptr;
        return false;
    }

    log_info("  Actual n_ctx usado: " + std::to_string(llama_n_ctx(ctx_)));
    log_info("  Actual n_batch usado: " + std::to_string(llama_n_batch(ctx_)));

    auto end = std::chrono::steady_clock::now();
    double ms = std::chrono::duration<double, std::milli>(end - start).count();

    model_name_ = std::filesystem::path(config.model_path).filename().string();

    log_info("Modelo LLM cargado en " + std::to_string(static_cast<int>(ms)) + "ms: " + model_name_);
    return true;
}

std::string LLMEngine::last_error() const { return last_error_; }

void LLMEngine::unload_model() {
    cleanup();
    model_name_.clear();
    log_info("Modelo LLM descargado");
}

bool LLMEngine::is_loaded() const {
    return model_ != nullptr && ctx_ != nullptr;
}

std::vector<int32_t> LLMEngine::tokenize(const std::string& text, bool add_bos) {
    if (!model_) return {};

    int max_tokens = static_cast<int>(text.size()) + 128;
    std::vector<int32_t> tokens(static_cast<size_t>(max_tokens));

    const llama_vocab* vocab = llama_model_get_vocab(model_);
    int n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()),
                           tokens.data(), max_tokens, add_bos, false);
    if (n < 0) {
        // Buffer demasiado pequeno, reintentar
        max_tokens = -n + 16;
        tokens.resize(static_cast<size_t>(max_tokens));
        n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()),
                           tokens.data(), max_tokens, add_bos, false);
    }

    if (n > 0) {
        tokens.resize(static_cast<size_t>(n));
    } else {
        tokens.clear();
    }
    return tokens;
}

std::string LLMEngine::token_to_string(int32_t token) {
    if (!model_) return "";

    const llama_vocab* vocab = llama_model_get_vocab(model_);
    char buf[64];
    int n = llama_token_to_piece(vocab, token, buf, sizeof(buf), 0, false);
    if (n > 0) {
        return std::string(buf, static_cast<size_t>(n));
    }
    return "";
}

llama_sampler* LLMEngine::create_sampler() {
    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* smpl = llama_sampler_chain_init(sparams);

    // 1. Repeat penalty (si esta habilitado)
    if (config_.repeat_penalty > 1.0f && config_.repeat_last_n != 0) {
        llama_sampler_chain_add(smpl, llama_sampler_init_penalties(
            config_.repeat_last_n,
            config_.repeat_penalty,
            0.0f,   // freq penalty
            0.0f)); // presence penalty
    }

    // 2. Top-K (0 = desactivado)
    if (config_.top_k > 0)
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(config_.top_k));

    // 3. Top-P
    if (config_.top_p < 1.0f)
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(config_.top_p, 1));

    // 4. Min-P
    if (config_.min_p > 0.0f)
        llama_sampler_chain_add(smpl, llama_sampler_init_min_p(config_.min_p, 1));

    // 5. Temperatura
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(config_.temperature));

    // 6. Distribucion final con seed
    uint32_t seed = (config_.seed < 0)
        ? static_cast<uint32_t>(std::chrono::steady_clock::now().time_since_epoch().count())
        : static_cast<uint32_t>(config_.seed);
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(seed));

    return smpl;
}

LLMResult LLMEngine::generate(const std::string& prompt) {
    return generate_streaming(prompt, nullptr);
}

LLMResult LLMEngine::generate_streaming(const std::string& prompt, TokenCallback callback) {
    LLMResult result;

    if (!is_loaded()) {
        result.success = false;
        result.error = "Modelo no cargado";
        return result;
    }

    auto start = std::chrono::steady_clock::now();

    // Tokenizar prompt
    auto tokens = tokenize(prompt, true);
    if (tokens.empty()) {
        result.success = false;
        result.error = "Error tokenizando prompt";
        return result;
    }

    result.tokens_prompt = static_cast<int>(tokens.size());

    // Verificar que no excede el contexto
    int n_ctx = llama_n_ctx(ctx_);
    if (result.tokens_prompt >= n_ctx) {
        result.success = false;
        result.error = "Prompt excede el contexto (" +
                       std::to_string(result.tokens_prompt) + " >= " +
                       std::to_string(n_ctx) + ")";
        return result;
    }

    // Prefix caching: detectar prefijo comun con la generacion anterior
    size_t common_prefix = 0;
    size_t cmp_len = std::min(tokens.size(), last_tokens_.size());
    for (; common_prefix < cmp_len; ++common_prefix) {
        if (tokens[common_prefix] != last_tokens_[common_prefix]) break;
    }
    // Heuristica: si el prefijo comun es todo el prompt nuevo, debemos reprocesar al menos
    // el ultimo token (para producir logits). Lo recortamos a tokens.size()-1.
    if (common_prefix > 0 && common_prefix == tokens.size())
        common_prefix = tokens.size() - 1;
    // Solo vale la pena si el ahorro es significativo
    if (common_prefix == 0 || common_prefix < tokens.size() / 4) {
        llama_memory_clear(llama_get_memory(ctx_), true);
        common_prefix = 0;
    } else {
        llama_memory_seq_rm(llama_get_memory(ctx_), 0,
                            static_cast<int32_t>(common_prefix), -1);
    }

    // Crear batch y procesar tokens del prompt (solo los nuevos tras el prefijo comun)
    llama_batch batch = llama_batch_init(config_.n_batch, 0, 1);

    int total_tokens = static_cast<int>(tokens.size());
    for (int i = static_cast<int>(common_prefix); i < total_tokens; ++i) {
        batch.token[batch.n_tokens] = tokens[static_cast<size_t>(i)];
        batch.pos[batch.n_tokens] = i;
        batch.n_seq_id[batch.n_tokens] = 1;
        batch.seq_id[batch.n_tokens][0] = 0;
        batch.logits[batch.n_tokens] = (i == total_tokens - 1) ? 1 : 0;
        batch.n_tokens++;

        // Si el batch esta lleno, decodificar
        if (batch.n_tokens >= config_.n_batch) {
            if (llama_decode(ctx_, batch) != 0) {
                result.success = false;
                result.error = "Error decodificando prompt";
                llama_batch_free(batch);
                return result;
            }
            batch.n_tokens = 0;
        }
    }

    // Decodificar tokens restantes del prompt
    if (batch.n_tokens > 0) {
        if (llama_decode(ctx_, batch) != 0) {
            result.success = false;
            result.error = "Error decodificando prompt";
            llama_batch_free(batch);
            return result;
        }
    }

    // Crear sampler con RAII para garantizar liberacion ante cualquier salida
    auto smpl = std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)>(
        create_sampler(), llama_sampler_free);

    // Generar tokens
    int n_generated = 0;
    int max_tokens = std::min(config_.max_tokens, n_ctx - result.tokens_prompt);
    const llama_vocab* vocab = llama_model_get_vocab(model_);
    llama_token eos = llama_vocab_eos(vocab);

    for (int i = 0; i < max_tokens; ++i) {
        // Samplear siguiente token
        llama_token new_token = llama_sampler_sample(smpl.get(), ctx_, -1);
        llama_sampler_accept(smpl.get(), new_token);

        // Verificar fin de secuencia
        if (llama_vocab_is_eog(vocab, new_token) || new_token == eos) {
            break;
        }

        // Convertir token a texto
        std::string piece = token_to_string(new_token);
        result.text += piece;
        ++n_generated;

        // Callback de streaming
        if (callback) {
            if (!callback(piece)) {
                break; // Usuario cancelo
            }
        }

        // Preparar batch para siguiente token
        batch.n_tokens = 0;
        batch.token[0] = new_token;
        batch.pos[0] = result.tokens_prompt + i;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = 1;
        batch.n_tokens = 1;

        if (llama_decode(ctx_, batch) != 0) {
            result.success = false;
            result.error = "Error durante generacion en token " + std::to_string(i);
            break;
        }
    }

    llama_batch_free(batch);

    // Guardar el prompt actual para posible prefix caching en la siguiente llamada.
    // Solo guardamos los tokens del prompt (no los generados) porque el siguiente prompt
    // contendra todo el historial relevante y queremos detectar el prefijo del prompt.
    if (result.success) {
        last_tokens_ = std::move(tokens);
    } else {
        last_tokens_.clear();
    }

    auto end = std::chrono::steady_clock::now();
    result.tokens_generated = n_generated;
    result.generation_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    if (result.tokens_generated > 0 && result.success) {
        double tokens_per_sec = (result.tokens_generated * 1000.0) / result.generation_time_ms;
        log_debug("Generacion completada: " + std::to_string(n_generated) +
                  " tokens en " + std::to_string(static_cast<int>(result.generation_time_ms)) +
                  "ms (" + std::to_string(static_cast<int>(tokens_per_sec)) + " t/s)");
    }

    return result;
}

std::string LLMEngine::model_name() const { return model_name_; }

int LLMEngine::context_length() const {
    if (ctx_) return llama_n_ctx(ctx_);
    return config_.n_ctx;
}

int LLMEngine::count_tokens(const std::string& text) const {
    if (!model_) return -1;
    if (text.empty()) return 0;
    const llama_vocab* vocab = llama_model_get_vocab(model_);
    // llama_tokenize con buffer nulo devuelve -n_tokens_reales.
    int n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()),
                           nullptr, 0, /*add_bos=*/false, /*parse_special=*/true);
    return n < 0 ? -n : n;
}

void LLMEngine::set_temperature(float temp) { config_.temperature = temp; }
void LLMEngine::set_top_p(float top_p) { config_.top_p = top_p; }
void LLMEngine::set_max_tokens(int max_tokens) { config_.max_tokens = max_tokens; }
void LLMEngine::set_top_k(int v) { config_.top_k = v; }
void LLMEngine::set_min_p(float v) { config_.min_p = v; }
void LLMEngine::set_repeat_penalty(float v) { config_.repeat_penalty = v; }
void LLMEngine::set_repeat_last_n(int v) { config_.repeat_last_n = v; }

} // namespace alfred
