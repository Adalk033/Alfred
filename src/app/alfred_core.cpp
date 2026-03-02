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

#include "llama.h"

#include <chrono>
#include <filesystem>
#include <algorithm>
#include <regex>

namespace alfred {

AlfredCore::AlfredCore()
    : llm_(std::make_unique<LLMEngine>()) {}

AlfredCore::~AlfredCore() = default;

bool AlfredCore::initialize() {
    log_info("=== Inicializando Alfred Core ===");
    auto& cfg = get_config();

    // 1. Detectar GPU
    log_info("Paso 1/2: Detectando GPU...");
    auto& gpu = GPUManager::instance();
    gpu.detect();
    if (gpu.has_cuda()) {
        log_info(gpu.status_report());
    } else {
        log_warn("Sin GPU CUDA - usando CPU para inferencia");
    }

    // 2. Cargar modelo LLM
    log_info("Paso 2/2: Cargando modelo LLM...");
    {
        // Restaurar ultimo modelo usado desde DB (si existe)
        auto& db = DBManager::instance();
        auto last_llm = db.get_model_setting("last_used_model");
        if (last_llm && !last_llm->empty()) {
            cfg.llm_model_file = std::filesystem::path(*last_llm).filename().string();
        }

        std::string llm_path;
        if (!cfg.llm_model_file.empty()) {
            llm_path = cfg.models_dir + "/" + cfg.llm_model_file;
        }

        if (llm_path.empty() || !std::filesystem::exists(llm_path)) {
            log_warn("Sin modelo LLM configurado. Usa la UI para descargar y seleccionar uno.");
        } else {
            LLMConfig llm_config;
            llm_config.model_path = llm_path;
            llm_config.n_ctx = cfg.n_ctx;
            llm_config.n_gpu_layers = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
            llm_config.n_batch = cfg.n_batch;
            llm_config.n_threads = cfg.n_threads;
            llm_config.temperature = cfg.temperature;
            llm_config.top_p = cfg.top_p;
            llm_config.max_tokens = cfg.max_tokens;
            llm_config.seed = cfg.seed;

            if (!llm_->load_model(llm_config)) {
                log_error("Error cargando modelo LLM");
            }
        }
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

    initialized_ = true;
    log_info("=== Alfred Core inicializado correctamente ===");
    return true;
}

// ============================================================================
// Cache LRU
// ============================================================================
std::optional<QueryResult> AlfredCore::cache_lookup(const std::string& question) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto& cfg = get_config();

    std::string normalized = trim(to_lower(question));
    size_t hash = std::hash<std::string>{}(normalized);

    auto it = query_cache_.find(hash);
    if (it == query_cache_.end()) return std::nullopt;

    // Verificar TTL
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - it->second.timestamp).count();

    if (elapsed > cfg.query_cache_ttl_seconds) {
        query_cache_.erase(it);
        return std::nullopt;
    }

    auto result = it->second.result;
    result.from_cache = true;
    return result;
}

void AlfredCore::cache_insert(const std::string& question, const QueryResult& result) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
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
std::string AlfredCore::apply_user_profile(const std::string& prompt) {
    auto& cfg = get_config();
    std::string result = prompt;

    auto replace_all = [](std::string& str, const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = str.find(from, pos)) != std::string::npos) {
            str.replace(pos, from.length(), to);
            pos += to.length();
        }
    };

    replace_all(result, "{USER_NAME}", cfg.user_name.empty() ? "Usuario" : cfg.user_name);
    replace_all(result, "{USER_AGE}", cfg.user_age.empty() ? "No especificada" : cfg.user_age);
    replace_all(result, "{USER_OCCUPATION}", cfg.user_occupation.empty() ? "No especificada" : cfg.user_occupation);
    replace_all(result, "{ABOUT_USER}", cfg.about_user.empty() ? "No especificado" : cfg.about_user);
    replace_all(result, "{DATETIME}", get_current_datetime());

    return result;
}

std::string AlfredCore::build_prompt(const std::string& template_str,
                                      const std::string& context,
                                      const std::string& question) {
    std::string prompt = apply_user_profile(template_str);

    auto replace_all = [](std::string& str, const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = str.find(from, pos)) != std::string::npos) {
            str.replace(pos, from.length(), to);
            pos += to.length();
        }
    };

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

    // 3. Obtener contexto de conversacion
    std::string conversation_context;
    if (!conversation_id.empty()) {
        conversation_context = ConversationManager::instance()
            .format_history_as_context(conversation_id, 50);
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

bool AlfredCore::change_model(const std::string& model_path) {
    log_info("Cambiando modelo LLM a: " + model_path);

    auto& cfg = get_config();
    auto& gpu = GPUManager::instance();

    LLMConfig llm_config;
    llm_config.model_path = model_path;
    llm_config.n_ctx = cfg.n_ctx;
    llm_config.n_gpu_layers = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
    llm_config.n_batch = cfg.n_batch;
    llm_config.temperature = cfg.temperature;
    llm_config.top_p = cfg.top_p;
    llm_config.max_tokens = cfg.max_tokens;

    llm_->unload_model();
    bool success = llm_->load_model(llm_config);

    if (success) {
        // Persistir en DB
        DBManager::instance().set_model_setting("last_used_model", model_path);
        // Limpiar cache
        clear_cache();
    }

    return success;
}

json AlfredCore::get_stats() {
    json stats;
    stats["initialized"] = initialized_;
    stats["llm_loaded"] = llm_->is_loaded();
    stats["llm_model"] = llm_->model_name();
    stats["cache_size"] = query_cache_.size();
    stats["gpu"] = json::parse(GPUManager::instance().status_json());
    return stats;
}

void AlfredCore::clear_cache() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    query_cache_.clear();
}

json AlfredCore::get_cache_stats() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    json stats;
    stats["entries"] = query_cache_.size();
    stats["max_entries"] = get_config().query_cache_max;
    stats["ttl_seconds"] = get_config().query_cache_ttl_seconds;
    return stats;
}

LLMEngine& AlfredCore::llm() { return *llm_; }
bool AlfredCore::is_initialized() const { return initialized_; }

} // namespace alfred
