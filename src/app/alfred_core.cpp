// ============================================================================
// alfred_core.cpp - Motor central de Alfred
// ============================================================================
// Orquesta: query -> cache LRU -> historial -> LLM
// ============================================================================
#include "alfred/alfred_core.h"
#include "alfred/config.h"
#include "alfred/paths.h"
#include "alfred/logger.h"
#include "alfred/gpu_manager.h"
#include "alfred/db_manager.h"
#include "alfred/history_manager.h"
#include "alfred/conversation_manager.h"
#include "alfred/string_utils.h"
#include "alfred/token_accountant.h"
#include "alfred/tone.h"

#include "llama.h"

#include <chrono>
#include <filesystem>
#include <algorithm>
#include <regex>
#include <vector>
#include <future>

namespace alfred {

AlfredCore::AlfredCore()
    : llm_(std::make_unique<LLMEngine>()) {}

AlfredCore::~AlfredCore() {
    stop_idle_monitor();
}

bool AlfredCore::initialize() {
    log_info("=== Inicializando Alfred Core ===");
    auto& cfg = get_config();

    // 1. Detectar GPU en paralelo con la lectura de settings de DB
    log_info("Paso 1/2: Detectando GPU (en paralelo con DB)...");
    auto gpu_future = std::async(std::launch::async, []() {
        GPUManager::instance().detect();
    });

    // 2. Cargar modelo LLM
    log_info("Paso 2/2: Configurando modelo LLM...");
    {
        // Determinar ruta del modelo
        auto& db = DBManager::instance();
        auto last_llm = db.get_model_setting("last_used_model");
        if (last_llm && !last_llm->empty())
            cfg.llm_model_file = std::filesystem::path(*last_llm).filename().string();

        std::string llm_path;
        if (!cfg.llm_model_file.empty())
            llm_path = cfg.models_dir + "/" + cfg.llm_model_file;

        // Helpers para leer settings tipados desde DB
        auto get_int = [&](const std::string& k, int& dst) {
            auto v = db.get_app_setting(k);
            if (v) { try { dst = std::stoi(*v); } catch (...) {} }
        };
        auto get_float = [&](const std::string& k, float& dst) {
            auto v = db.get_app_setting(k);
            if (v) { try { dst = std::stof(*v); } catch (...) {} }
        };
        auto get_bool = [&](const std::string& k, bool& dst) {
            auto v = db.get_app_setting(k);
            if (v) { dst = (*v == "true" || *v == "1"); }
        };
        auto get_str = [&](const std::string& k, std::string& dst) {
            auto v = db.get_app_setting(k);
            if (v && !v->empty()) dst = *v;
        };

        // Settings basicos (existentes)
        get_int  ("model_idle_timeout_sec", cfg.model_idle_timeout_sec);
        get_int  ("n_ctx",                  cfg.n_ctx);
        get_int  ("n_gpu_layers",           cfg.n_gpu_layers);
        get_int  ("n_batch",                cfg.n_batch);
        get_int  ("n_threads",              cfg.n_threads);
        get_float("temperature",            cfg.temperature);
        get_float("top_p",                  cfg.top_p);
        get_int  ("max_tokens",             cfg.max_tokens);
        get_int  ("seed",                   cfg.seed);

        // Settings nuevos (tuning avanzado)
        get_int  ("n_ubatch",         cfg.n_ubatch);
        get_int  ("n_threads_batch",  cfg.n_threads_batch);
        get_int  ("flash_attn",       cfg.flash_attn);
        get_bool ("offload_kqv",      cfg.offload_kqv);
        get_bool ("use_mmap",         cfg.use_mmap);
        get_bool ("use_mlock",        cfg.use_mlock);
        get_str  ("cache_type_k",     cfg.cache_type_k);
        get_str  ("cache_type_v",     cfg.cache_type_v);
        get_int  ("top_k",            cfg.top_k);
        get_float("min_p",            cfg.min_p);
        get_float("repeat_penalty",   cfg.repeat_penalty);
        get_int  ("repeat_last_n",    cfg.repeat_last_n);
        get_bool ("model_warmup",     cfg.model_warmup);

        // Esperar deteccion de GPU antes de cargar modelo
        gpu_future.wait();
        auto& gpu = GPUManager::instance();
        if (gpu.has_cuda()) {
            log_info(gpu.status_report());
        } else {
            log_warn("Sin GPU CUDA - usando CPU para inferencia");
        }

        if (llm_path.empty() || !std::filesystem::exists(llm_path)) {
            log_warn("Sin modelo LLM configurado. Usa la UI para descargar y seleccionar uno.");
        } else if (cfg.model_lazy_load) {
            pending_model_path_ = llm_path;
            log_info("Modelo configurado para carga lazy: " + pending_model_path_);
        } else {
            // Carga inmediata (comportamiento legacy)
            lifecycle_.set_loading();
            if (!llm_->load_model(build_llm_config(llm_path))) {
                log_error("Error cargando modelo LLM");
            } else {
                warmup_model();
            }
            lifecycle_.set_idle_now();
        }

        // Arrancar monitor de inactividad en ambos modos
        start_idle_monitor();
    }

    // Cargar perfil de usuario desde DB
    auto& db = DBManager::instance();
    auto name = db.get_user_setting("user_name");
    if (name) cfg.user_name = *name;
    auto age = db.get_user_setting("user_age");
    if (age) cfg.user_age = *age;
    auto occupation = db.get_user_setting("user_occupation");
    if (occupation) cfg.user_occupation = *occupation;
    auto about = db.get_user_setting("about_user");
    if (about) cfg.about_user = *about;

    // Cargar personalizacion del asistente desde DB
    if (auto v = db.get_user_setting("assistant_name");      v && !v->empty()) cfg.assistant_name      = *v;
    if (auto v = db.get_user_setting("response_tone");       v && !v->empty()) cfg.response_tone       = *v;
    if (auto v = db.get_user_setting("custom_instructions"); v)                cfg.custom_instructions = *v;

    initialized_ = true;
    log_info("=== Alfred Core inicializado correctamente ===");
    return true;
}

// ============================================================================
// Lazy loading del modelo
// ============================================================================
LLMConfig AlfredCore::build_llm_config(const std::string& model_path, int gpu_layers_override) {
    auto& cfg = get_config();
    LLMConfig c;
    c.model_path      = model_path;
    c.n_ctx           = cfg.n_ctx;
    c.n_gpu_layers    = gpu_layers_override >= 0 ? gpu_layers_override : cfg.n_gpu_layers;
    c.n_batch         = cfg.n_batch;
    c.n_ubatch        = cfg.n_ubatch;
    c.n_threads       = cfg.n_threads;
    c.n_threads_batch = cfg.n_threads_batch;
    c.flash_attn      = cfg.flash_attn;
    c.offload_kqv     = cfg.offload_kqv;
    c.use_mmap        = cfg.use_mmap;
    c.use_mlock       = cfg.use_mlock;
    c.cache_type_k    = cfg.cache_type_k;
    c.cache_type_v    = cfg.cache_type_v;
    c.temperature     = cfg.temperature;
    c.top_p           = cfg.top_p;
    c.top_k           = cfg.top_k;
    c.min_p           = cfg.min_p;
    c.repeat_penalty  = cfg.repeat_penalty;
    c.repeat_last_n   = cfg.repeat_last_n;
    c.max_tokens      = cfg.max_tokens;
    c.seed            = cfg.seed;
    return c;
}

void AlfredCore::warmup_model() {
    if (!llm_->is_loaded()) return;
    if (!get_config().model_warmup) return;

    log_info("Ejecutando warm-up del modelo...");
    auto start = std::chrono::steady_clock::now();

    int saved_max = get_config().max_tokens;
    llm_->set_max_tokens(1);
    auto r = llm_->generate("Hola");
    llm_->set_max_tokens(saved_max);

    auto ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - start).count();
    if (r.success) {
        log_info("Warm-up completado en " + std::to_string(static_cast<int>(ms)) + "ms");
    } else {
        log_warn("Warm-up fallo: " + r.error);
    }
}

void AlfredCore::ensure_model_loaded() {
    std::lock_guard<std::mutex> lock(model_load_mutex_);
    if (llm_->is_loaded() || pending_model_path_.empty()) return;

    lifecycle_.set_loading();
    log_info("Cargando modelo en demanda: " + pending_model_path_);
    auto& gpu = GPUManager::instance();
    gpu.refresh();

    std::error_code ec;
    auto fsize = std::filesystem::file_size(pending_model_path_, ec);
    size_t model_mb = ec ? 0 : static_cast<size_t>(fsize / (1024 * 1024));

    const int requested_layers = get_config().n_gpu_layers;
    std::vector<int> attempts = {
        requested_layers,
        gpu.optimal_gpu_layers(model_mb),
        0
    };
    int tried = -9999;
    bool attempted_gpu = false;

    log_info("Loading model: " + pending_model_path_);
    log_info("Requested GPU layers (config): " + std::to_string(requested_layers));

    for (int layers : attempts) {
        if (layers > 0 && !gpu.has_cuda()) continue;
        if (layers == tried) continue;
        tried = layers;

        if (layers > 0) {
            attempted_gpu = true;
        }

        log_info("Intentando carga lazy con n_gpu_layers=" + std::to_string(layers));
        if (llm_->load_model(build_llm_config(pending_model_path_, layers))) {
            if (layers == 0 && attempted_gpu) {
                log_warn("Falling back to CPU due to error en carga GPU previa");
            }
            warmup_model();
            lifecycle_.set_idle_now();
            return;
        }

        log_warn("Fallo carga lazy con n_gpu_layers=" + std::to_string(layers) +
                 " | Motivo: " + llm_->last_error());
        llm_->unload_model();
    }
    lifecycle_.set_idle_now();
    log_error("Error en carga lazy del modelo LLM: " + llm_->last_error());
}

void AlfredCore::start_idle_monitor() {
    stop_monitor_ = false;
    idle_monitor_thread_ = std::thread([this]() {
        while (!stop_monitor_.load()) {
            // Despertamos por (a) transicion del lifecycle o (b) timeout de 5s.
            // Esto evita spin loops de 1s cuando el modelo esta idle muchas horas.
            lifecycle_.wait_for(std::chrono::seconds(5),
                [this]{ return stop_monitor_.load(); });
            if (stop_monitor_.load()) break;

            const int timeout = get_config().model_idle_timeout_sec;
            if (timeout <= 0) continue;

            std::lock_guard<std::mutex> lock(model_load_mutex_);
            if (!llm_->is_loaded()) continue;

            // Solo descarga si estado == IDLE, in_flight == 0 y se cumplio el
            // timeout de inactividad. Durante PROCESSING esto devuelve false
            // y nunca se interrumpe una inferencia en curso.
            if (!lifecycle_.can_unload(timeout)) continue;

            log_info("Modelo IDLE >= " + std::to_string(timeout) +
                     "s, descargando recursos...");
            llm_->unload_model();
        }
    });
}

void AlfredCore::stop_idle_monitor() {
    stop_monitor_ = true;
    lifecycle_.notify();   // despertar monitor para que vea stop_monitor_
    if (idle_monitor_thread_.joinable())
        idle_monitor_thread_.join();
}

// ============================================================================
// Cache LRU
// ============================================================================
std::optional<QueryResult> AlfredCore::cache_lookup(const std::string& question) {
    auto& cfg = get_config();

    std::string normalized = trim(to_lower(question));
    size_t hash = std::hash<std::string>{}(normalized);

    {
        std::shared_lock<std::shared_mutex> lock(cache_mutex_);
        auto it = query_cache_.find(hash);
        if (it == query_cache_.end()) return std::nullopt;

        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
            now - it->second.timestamp).count();

        if (elapsed <= cfg.query_cache_ttl_seconds) {
            auto result = it->second.result;
            result.from_cache = true;
            return result;
        }
    }
    // Expirado: promover a unique_lock para borrar
    std::unique_lock<std::shared_mutex> lock(cache_mutex_);
    auto it = query_cache_.find(hash);
    if (it != query_cache_.end()) {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
            now - it->second.timestamp).count();
        if (elapsed > cfg.query_cache_ttl_seconds)
            query_cache_.erase(it);
    }
    return std::nullopt;
}

void AlfredCore::cache_insert(const std::string& question, const QueryResult& result) {
    std::unique_lock<std::shared_mutex> lock(cache_mutex_);
    auto& cfg = get_config();

    // Evictar si cache lleno
    if (static_cast<int>(query_cache_.size()) >= cfg.query_cache_max) {
        cache_evict_expired();
        // Si aun esta lleno, eliminar el mas antiguo
        if (static_cast<int>(query_cache_.size()) >= cfg.query_cache_max) {
            auto oldest = query_cache_.begin();
            for (auto it = query_cache_.begin(); it != query_cache_.end(); ++it) {
                if (it->second.timestamp < oldest->second.timestamp) {
                    oldest = it;
                }
            }
            query_cache_.erase(oldest);
        }
    }

    std::string normalized = trim(to_lower(question));
    size_t hash = std::hash<std::string>{}(normalized);
    query_cache_[hash] = {result, std::chrono::steady_clock::now()};
}

void AlfredCore::cache_evict_expired() {
    auto& cfg = get_config();
    auto now = std::chrono::steady_clock::now();

    for (auto it = query_cache_.begin(); it != query_cache_.end();) {
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
            now - it->second.timestamp).count();
        if (elapsed > cfg.query_cache_ttl_seconds) {
            it = query_cache_.erase(it);
        } else {
            ++it;
        }
    }
}

// ============================================================================
// Prompt building
// ============================================================================
std::string AlfredCore::resolve_system_prompt(const std::string& template_str) {
    return apply_user_profile(template_str);
}

std::string AlfredCore::apply_user_profile(const std::string& prompt) {
    auto& cfg = get_config();
    std::string result = prompt;

    const std::string assistant = cfg.assistant_name.empty() ? "Alfred" : cfg.assistant_name;
    const ToneSpec tone = resolve_tone(cfg.response_tone);

    replace_all(result, "{ASSISTANT_NAME}", assistant);
    replace_all(result, "{USER_NAME}", cfg.user_name.empty() ? "Usuario" : cfg.user_name);
    replace_all(result, "{USER_AGE}", cfg.user_age.empty() ? "No especificada" : cfg.user_age);
    replace_all(result, "{USER_OCCUPATION}", cfg.user_occupation.empty() ? "No especificada" : cfg.user_occupation);
    replace_all(result, "{ABOUT_USER}", cfg.about_user.empty() ? "No especificado" : cfg.about_user);
    replace_all(result, "{DATETIME}", get_current_datetime());
    replace_all(result, "{TONE_DIRECTIVE}", tone.directive);
    replace_all(result, "{CUSTOM_INSTRUCTIONS}",
                cfg.custom_instructions.empty() ? "(ninguna)" : cfg.custom_instructions);

    return result;
}

std::string AlfredCore::build_prompt(const std::string& template_str,
                                      const std::string& context,
                                      const std::string& question) {
    std::string prompt = apply_user_profile(template_str);
    replace_all(prompt, "{context}", context);
    replace_all(prompt, "{input}", question);
    return prompt;
}

// ============================================================================
// Generacion de respuestas
// ============================================================================
QueryResult AlfredCore::generate_response(
    const std::string& question, const std::string& conversation_context) {
    QueryResult result;

    if (!llm_->is_loaded()) {
        result.answer = "Error: Modelo LLM no cargado. "
                       "Coloca un modelo GGUF en la carpeta de modelos.";
        return result;
    }

    std::string prompt = build_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS,
                                       conversation_context, question);

    auto llm_result = llm_->generate(prompt);

    if (llm_result.success) {
        result.answer = trim(llm_result.text);
    } else {
        result.answer = "Error generando respuesta: " + llm_result.error;
    }

    return result;
}

// ============================================================================
// Query principal
// ============================================================================
QueryResult AlfredCore::query(const std::string& question,
                               bool use_history,
                               const std::string& conversation_id) {
    ensure_model_loaded();

    // Marca PROCESSING mientras viva este scope. El monitor de inactividad
    // no podra descargar el modelo aunque la generacion dure horas.
    ModelLifecycle::Scope scope(lifecycle_);

    auto start = std::chrono::steady_clock::now();
    QueryResult result;

    // 1. Buscar en cache
    auto cached = cache_lookup(question);
    if (cached) {
        log_debug("Respuesta servida desde cache");
        cached->total_time_ms = 0.1;
        return *cached;
    }

    // 2. Buscar en historial Q&A
    if (use_history) {
        auto history_results = HistoryManager::instance().search(question, 0.6f, 1);
        if (!history_results.empty() && history_results[0].score > 0.6f) {
            result.answer = history_results[0].entry.answer;
            result.personal_data = history_results[0].entry.personal_data;
            result.from_history = true;

            auto end = std::chrono::steady_clock::now();
            result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

            cache_insert(question, result);
            log_debug("Respuesta servida desde historial (score=" +
                      std::to_string(history_results[0].score) + ")");
            return result;
        }
    }

    // 3. Obtener contexto de conversacion: truncado por tokens reales contra
    //    el tokenizer del modelo cargado. El presupuesto se calcula como
    //    n_ctx - (system + pregunta + tokens reservados para la respuesta
    //    + margen de seguridad). Si por algun motivo da negativo, se omite
    //    el historial para no desbordar el contexto.
    std::string conversation_context;
    if (!conversation_id.empty() && llm_->is_loaded()) {
        const int context_max = llm_->context_length();
        const int reserved    = get_config().max_tokens;
        const int safety      = 128;

        int system_toks   = llm_->count_tokens(resolve_system_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS));
        int question_toks = llm_->count_tokens(question);
        if (system_toks   < 0) system_toks   = 512;   // estimado conservador
        if (question_toks < 0) question_toks = static_cast<int>(question.size()) / 4;

        const int history_budget = context_max - reserved - system_toks - question_toks - safety;
        if (history_budget > 0) {
            auto msgs = ConversationManager::instance()
                .select_history_within_budget(conversation_id, *llm_, history_budget);
            conversation_context = ConversationManager::format_messages_as_context(msgs);
        }
    }

    // 4. Generar respuesta
    result = generate_response(question, conversation_context);

    auto end = std::chrono::steady_clock::now();
    result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    // 5. Guardar en historial y cache
    if (!result.answer.empty() && result.answer.find("Error") == std::string::npos) {
        HistoryManager::instance().save(question, result.answer,
                                         result.personal_data, "");
        cache_insert(question, result);
    }

    return result;
}

// ============================================================================
// Query con streaming de tokens (SSE)
// ============================================================================
QueryResult AlfredCore::query_streaming(const std::string& question,
                                        StartedCallback on_started,
                                        TokenStreamCallback on_token,
                                        bool use_history,
                                        const std::string& conversation_id) {
    ensure_model_loaded();
    ModelLifecycle::Scope scope(lifecycle_);

    // Reservar request_id y resetear flag de cancelacion antes de cualquier
    // trabajo. Esto debe ocurrir antes de notificar a la UI.
    uint64_t my_id = next_request_id_.fetch_add(1);
    active_request_id_.store(my_id);
    cancel_flag_.store(false);

    if (on_started) on_started(my_id);

    auto cleanup_active = [this, my_id]() {
        uint64_t expected = my_id;
        active_request_id_.compare_exchange_strong(expected, 0);
    };

    auto start = std::chrono::steady_clock::now();
    QueryResult result;

    // 1. Buscar en cache (servir como un unico token)
    auto cached = cache_lookup(question);
    if (cached) {
        log_debug("Streaming: respuesta servida desde cache");
        cached->total_time_ms = 0.1;
        if (on_token && !cancel_flag_.load()) on_token(cached->answer);
        cleanup_active();
        return *cached;
    }

    // 2. Buscar en historial Q&A
    if (use_history) {
        auto history_results = HistoryManager::instance().search(question, 0.6f, 1);
        if (!history_results.empty() && history_results[0].score > 0.6f) {
            result.answer = history_results[0].entry.answer;
            result.personal_data = history_results[0].entry.personal_data;
            result.from_history = true;

            auto end = std::chrono::steady_clock::now();
            result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

            cache_insert(question, result);
            log_debug("Streaming: respuesta servida desde historial (score=" +
                      std::to_string(history_results[0].score) + ")");
            if (on_token && !cancel_flag_.load()) on_token(result.answer);
            cleanup_active();
            return result;
        }
    }

    // 3. Construir contexto de conversacion
    std::string conversation_context;
    if (!conversation_id.empty() && llm_->is_loaded()) {
        const int context_max = llm_->context_length();
        const int reserved    = get_config().max_tokens;
        const int safety      = 128;

        int system_toks   = llm_->count_tokens(resolve_system_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS));
        int question_toks = llm_->count_tokens(question);
        if (system_toks   < 0) system_toks   = 512;
        if (question_toks < 0) question_toks = static_cast<int>(question.size()) / 4;

        const int history_budget = context_max - reserved - system_toks - question_toks - safety;
        if (history_budget > 0) {
            auto msgs = ConversationManager::instance()
                .select_history_within_budget(conversation_id, *llm_, history_budget);
            conversation_context = ConversationManager::format_messages_as_context(msgs);
        }
    }

    // 4. Generar con streaming
    if (!llm_->is_loaded()) {
        result.answer = "Error: Modelo LLM no cargado. "
                        "Coloca un modelo GGUF en la carpeta de modelos.";
        if (on_token) on_token(result.answer);
        auto end = std::chrono::steady_clock::now();
        result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();
        cleanup_active();
        return result;
    }

    std::string prompt = build_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS,
                                       conversation_context, question);

    auto wrapped_cb = [this, &on_token](const std::string& tok) -> bool {
        if (cancel_flag_.load()) return false;          // cancelado por el usuario
        if (!on_token) return true;
        return on_token(tok);                            // permite que el sink corte el stream
    };

    auto llm_result = llm_->generate_streaming(prompt, wrapped_cb);
    const bool was_cancelled = cancel_flag_.load();

    if (llm_result.success || !llm_result.text.empty()) {
        result.answer = trim(llm_result.text);
    } else {
        result.answer = "Error generando respuesta: " + llm_result.error;
    }
    result.cancelled = was_cancelled;

    auto end = std::chrono::steady_clock::now();
    result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    // 5. Guardar en historial y cache solo si la respuesta es completa
    if (!was_cancelled && !result.answer.empty() &&
        result.answer.find("Error") == std::string::npos) {
        HistoryManager::instance().save(question, result.answer,
                                         result.personal_data, "");
        cache_insert(question, result);
    }

    cleanup_active();
    return result;
}

bool AlfredCore::cancel_query(uint64_t request_id) {
    uint64_t active = active_request_id_.load();
    if (active == 0) return false;
    if (request_id != 0 && request_id != active) return false;
    cancel_flag_.store(true);
    log_info("Cancelacion solicitada para request_id=" + std::to_string(active));
    return true;
}

void AlfredCore::unload_current_model() {
    std::lock_guard<std::mutex> lock(model_load_mutex_);
    if (llm_->is_loaded()) {
        // Rechaza descarga manual mientras se esta generando: evita cortar
        // una respuesta del usuario. El cliente puede reintentar al terminar.
        if (lifecycle_.state() == ModelState::PROCESSING) {
            log_warn("unload_current_model() ignorado: modelo en PROCESSING");
            return;
        }
        log_info("Descargando modelo manualmente para liberar recursos...");
        llm_->unload_model();
        lifecycle_.set_idle_now();
    }
}

ModelChangeResult AlfredCore::change_model(const std::string& model_path) {
    log_info("Cambiando modelo LLM a: " + model_path);
    ModelChangeResult result;

    std::lock_guard<std::mutex> lock(model_load_mutex_);

    // No permitir cambio de modelo mientras hay inferencia en curso.
    if (lifecycle_.state() == ModelState::PROCESSING) {
        result.success = false;
        result.error   = "No se puede cambiar el modelo mientras se genera una respuesta. "
                         "Espera a que termine o cancela la peticion actual.";
        log_warn(result.error);
        return result;
    }

    lifecycle_.set_loading();
    llm_->unload_model();

    auto& gpu = GPUManager::instance();
    gpu.refresh();  // Refrescar VRAM actual antes de decidir

    std::error_code ec;
    auto fsize = std::filesystem::file_size(model_path, ec);
    size_t model_mb = ec ? 0 : static_cast<size_t>(fsize / (1024 * 1024));

    // Estrategia escalonada: full GPU -> parcial -> CPU
    const int requested_layers = get_config().n_gpu_layers;
    std::vector<int> attempts = { requested_layers, gpu.optimal_gpu_layers(model_mb), 0 };
    int used_layers = -1;
    bool attempted_gpu = false;

    log_info("Loading model: " + model_path);
    log_info("Requested GPU layers (config): " + std::to_string(requested_layers));

    for (int layers : attempts) {
        // Saltar si no hay CUDA y layers > 0
        if (layers > 0 && !gpu.has_cuda()) continue;
        // Saltar duplicados (ej: optimal ya era 99 o 0)
        if (layers == used_layers) continue;

        log_info("Intentando cargar modelo con gpu_layers=" + std::to_string(layers) + "...");
        if (layers > 0) {
            attempted_gpu = true;
        }
        llm_->unload_model();
        result.success = llm_->load_model(build_llm_config(model_path, layers));
        used_layers = layers;

        if (result.success) {
            if (layers == 0 && attempted_gpu) {
                log_warn("Falling back to CPU due to error en carga GPU previa");
            }
            if (layers == 0 && gpu.has_cuda()) {
                result.warning = "El modelo (" + std::to_string(model_mb) +
                    " MB) necesita mas VRAM de la disponible (" +
                    std::to_string(gpu.free_vram_mb()) +
                    " MB libres en " + gpu.info().device_name +
                    "). Se cargo en modo CPU, la inferencia sera mas lenta.";
                log_warn(result.warning);
            } else if (layers > 0 && layers < 99) {
                result.warning = "No hay suficiente VRAM para cargar el modelo completo en GPU. "
                    "Se cargaron " + std::to_string(layers) + " capas en " +
                    gpu.info().device_name + " (" + std::to_string(gpu.free_vram_mb()) +
                    " MB libres) y el resto en CPU.";
                log_info(result.warning);
            }
            break;
        } else {
            log_warn("Fallo carga de modelo con gpu_layers=" + std::to_string(layers) +
                     " | Motivo: " + llm_->last_error());
        }
    }

    if (result.success) {
        pending_model_path_ = model_path;
        DBManager::instance().set_model_setting("last_used_model", model_path);
        clear_cache();
        TokenAccountant::instance().clear();   // distinto tokenizer
        warmup_model();
        lifecycle_.set_idle_now();
    } else {
        result.error = llm_->last_error();
        lifecycle_.set_idle_now();
    }

    return result;
}

json AlfredCore::get_stats() {
    json stats;
    stats["initialized"]            = initialized_;
    stats["model_loaded"]           = llm_->is_loaded();
    stats["model_idle_timeout_sec"] = get_config().model_idle_timeout_sec;
    stats["model_lazy_load"]        = get_config().model_lazy_load;
    stats["llm_model"]              = llm_->model_name();
    switch (lifecycle_.state()) {
        case ModelState::IDLE:       stats["model_state"] = "idle"; break;
        case ModelState::LOADING:    stats["model_state"] = "loading"; break;
        case ModelState::PROCESSING: stats["model_state"] = "processing"; break;
    }
    stats["in_flight_requests"]     = lifecycle_.in_flight();
    {
        std::shared_lock<std::shared_mutex> lock(cache_mutex_);
        stats["cache_size"] = query_cache_.size();
    }
    stats["gpu"]                    = json::parse(GPUManager::instance().status_json());
    return stats;
}

void AlfredCore::clear_cache() {
    std::unique_lock<std::shared_mutex> lock(cache_mutex_);
    query_cache_.clear();
}

json AlfredCore::get_cache_stats() {
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    json stats;
    stats["entries"] = query_cache_.size();
    stats["max_entries"] = get_config().query_cache_max;
    stats["ttl_seconds"] = get_config().query_cache_ttl_seconds;
    return stats;
}

LLMEngine& AlfredCore::llm() { return *llm_; }
bool AlfredCore::is_initialized() const { return initialized_; }

} // namespace alfred
