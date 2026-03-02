// ============================================================================
// alfred_core.h - Motor central de Alfred
// ============================================================================
// Orquesta: query -> cache LRU -> historial -> LLM
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <mutex>
#include <nlohmann/json.hpp>

#include "alfred/llm_engine.h"

namespace alfred {

using json = nlohmann::json;

struct QueryResult {
    std::string answer;
    std::string personal_data;      // JSON de datos personales extraidos
    bool from_cache = false;
    bool from_history = false;
    double total_time_ms = 0.0;
};

// Entrada de cache LRU
struct CacheEntry {
    QueryResult result;
    std::chrono::steady_clock::time_point timestamp;
};

class AlfredCore {
public:
    AlfredCore();
    ~AlfredCore();

    // Inicializar todos los componentes (GPU, LLM)
    bool initialize();

    // Query principal - el punto de entrada para todas las consultas
    QueryResult query(const std::string& question,
                      bool use_history = true,
                      const std::string& conversation_id = "");

    // Cambiar modelo LLM
    bool change_model(const std::string& model_path);

    // Estadisticas generales
    json get_stats();

    // Cache
    void clear_cache();
    json get_cache_stats();

    // Acceso a componentes
    LLMEngine& llm();
    bool is_initialized() const;

private:
    std::unique_ptr<LLMEngine> llm_;

    bool initialized_ = false;

    // Cache LRU
    std::unordered_map<size_t, CacheEntry> query_cache_;
    std::mutex cache_mutex_;

    // Generar respuesta (conocimiento general)
    QueryResult generate_response(const std::string& question,
                                   const std::string& conversation_context);

    // Construir prompt con plantilla
    std::string build_prompt(const std::string& template_str,
                              const std::string& context,
                              const std::string& question);

    // Sustituir variables de perfil de usuario en prompt
    std::string apply_user_profile(const std::string& prompt);

    // Cache: buscar, insertar, limpiar expirados
    std::optional<QueryResult> cache_lookup(const std::string& question);
    void cache_insert(const std::string& question, const QueryResult& result);
    void cache_evict_expired();
};

} // namespace alfred
