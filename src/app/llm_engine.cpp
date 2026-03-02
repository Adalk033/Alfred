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

namespace alfred {

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
}

bool LLMEngine::load_model(const LLMConfig& config) {
    cleanup();
    config_ = config;

    log_info("Cargando modelo LLM: " + config.model_path);
    log_info("  GPU layers: " + std::to_string(config.n_gpu_layers));
    log_info("  Context: " + std::to_string(config.n_ctx));

    // Parametros del modelo
    auto model_params = llama_model_default_params();
    model_params.n_gpu_layers = config.n_gpu_layers;

    auto start = std::chrono::steady_clock::now();

    model_ = llama_model_load_from_file(config.model_path.c_str(), model_params);
    if (!model_) {
        log_error("Error cargando modelo: " + config.model_path);
        return false;
    }

    // Parametros del contexto
    auto ctx_params = llama_context_default_params();
    ctx_params.n_ctx = static_cast<uint32_t>(config.n_ctx);
    ctx_params.n_batch = static_cast<uint32_t>(config.n_batch);
    ctx_params.n_threads = 4;

    ctx_ = llama_init_from_model(model_, ctx_params);
    if (!ctx_) {
        log_error("Error creando contexto LLM");
        llama_model_free(model_);
        model_ = nullptr;
        return false;
    }

    auto end = std::chrono::steady_clock::now();
    double ms = std::chrono::duration<double, std::milli>(end - start).count();

    // Extraer nombre del modelo del path
    auto pos = config.model_path.find_last_of("/\\");
    model_name_ = (pos != std::string::npos)
        ? config.model_path.substr(pos + 1)
        : config.model_path;

    log_info("Modelo LLM cargado en " + std::to_string(static_cast<int>(ms)) + "ms: " + model_name_);
    return true;
}

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

    // Temperatura
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(config_.temperature));

    // Top-P
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(config_.top_p, 1));

    // Distribucion final
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

    // Limpiar estado previo del contexto
    llama_memory_clear(llama_get_memory(ctx_), true);

    // Crear batch y procesar tokens del prompt
    llama_batch batch = llama_batch_init(config_.n_batch, 0, 1);

    // Agregar tokens del prompt al batch
    for (int i = 0; i < static_cast<int>(tokens.size()); ++i) {
        batch.token[batch.n_tokens] = tokens[static_cast<size_t>(i)];
        batch.pos[batch.n_tokens] = i;
        batch.n_seq_id[batch.n_tokens] = 1;
        batch.seq_id[batch.n_tokens][0] = 0;
        batch.logits[batch.n_tokens] = (i == static_cast<int>(tokens.size()) - 1) ? 1 : 0;
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

    // Crear sampler
    llama_sampler* smpl = create_sampler();

    // Generar tokens
    int n_generated = 0;
    int max_tokens = std::min(config_.max_tokens, n_ctx - result.tokens_prompt);
    const llama_vocab* vocab = llama_model_get_vocab(model_);
    llama_token eos = llama_vocab_eos(vocab);

    for (int i = 0; i < max_tokens; ++i) {
        // Samplear siguiente token
        llama_token new_token = llama_sampler_sample(smpl, ctx_, -1);
        llama_sampler_accept(smpl, new_token);

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

    llama_sampler_free(smpl);
    llama_batch_free(batch);

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

size_t LLMEngine::model_size_mb() const {
    // Estimacion basica - no hay API directa para esto en llama.cpp
    return 0;
}

int LLMEngine::context_length() const {
    if (ctx_) return llama_n_ctx(ctx_);
    return config_.n_ctx;
}

void LLMEngine::set_temperature(float temp) { config_.temperature = temp; }
void LLMEngine::set_top_p(float top_p) { config_.top_p = top_p; }
void LLMEngine::set_max_tokens(int max_tokens) { config_.max_tokens = max_tokens; }

} // namespace alfred
