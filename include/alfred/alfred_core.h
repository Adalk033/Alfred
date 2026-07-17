// ============================================================================
// alfred_core.h - Motor central de Alfred
// ============================================================================
// Orquesta: query -> conversacion -> LLM
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <atomic>
#include <thread>
#include <chrono>
#include <unordered_map>
#include <list>
#include <optional>
#include <nlohmann/json.hpp>

#include "alfred/llm_engine.h"
#include "alfred/model_lifecycle.h"

namespace alfred {

using json = nlohmann::json;

struct QueryResult {
    std::string answer;
    bool from_cache = false;
    bool cancelled = false;         // true si el usuario cancelo el streaming
    bool is_error = false;          // true si la generacion fallo (no persistir)
    double total_time_ms = 0.0;
};

struct ModelChangeResult {
    bool success = false;
    std::string error;              // vacio si exito
    std::string warning;            // advertencia opcional (ej: fallback a CPU)
};

class AlfredCore {
public:
    AlfredCore();
    ~AlfredCore();

    // Inicializar todos los componentes (GPU, LLM)
    bool initialize();

    // Query principal - el punto de entrada para todas las consultas
    QueryResult query(const std::string& question,
                      const std::string& conversation_id = "");

    // Callbacks para query_streaming
    using StartedCallback = std::function<void(uint64_t request_id)>;
    using TokenStreamCallback = std::function<bool(const std::string& token)>;

    // Query con streaming de tokens. Llama on_started con el id antes de generar
    // (permite a la UI registrar el id para cancelar). on_token recibe cada
    // fragmento generado. Devuelve QueryResult con resultado final;
    // result.cancelled=true si fue interrumpido.
    QueryResult query_streaming(const std::string& question,
                                 StartedCallback on_started,
                                 TokenStreamCallback on_token,
                                 const std::string& conversation_id = "");

    // Cancela un query streaming en curso. Si request_id == 0, cancela el
    // activo sin importar id. Devuelve true si habia algo que cancelar.
    bool cancel_query(uint64_t request_id = 0);

    // Cambiar modelo LLM
    ModelChangeResult change_model(const std::string& model_path);

    // Descargar modelo actual (liberar GPU/RAM)
    void unload_current_model();

    // Estadisticas generales
    json get_stats();


    // Acceso a componentes
    LLMEngine& llm();
    bool is_initialized() const;
    ModelLifecycle& lifecycle() { return lifecycle_; }
    ModelState model_state() const { return lifecycle_.state(); }

    // Resuelve el template del system prompt sustituyendo perfil de usuario,
    // tono y custom_instructions. Uso publico: token accounting coherente
    // con lo que realmente se envia al modelo.
    std::string resolve_system_prompt(const std::string& template_str);

private:
    std::unique_ptr<LLMEngine> llm_;

    bool initialized_ = false;

    // Cancelacion de streaming: cada request registra su propio flag de
    // cancelacion en un mapa (un flag global permitia que un request B
    // concurrente anulara la cancelacion pendiente de A).
    std::atomic<uint64_t> next_request_id_{1};
    std::mutex requests_mutex_;
    std::unordered_map<uint64_t, std::shared_ptr<std::atomic<bool>>> active_cancel_flags_;

    // ------------------------------------------------------------------
    // Cache LRU de respuestas (la que anuncia el README). Solo para queries
    // sin conversacion (stateless): clave = hash(modelo + pregunta + params).
    // TTL y capacidad configurables (query_cache_*). max=0 la deshabilita.
    // ------------------------------------------------------------------
    struct CacheEntry {
        std::string answer;
        std::chrono::steady_clock::time_point stored_at;
        std::list<size_t>::iterator lru_it;
    };
    std::mutex cache_mutex_;
    std::unordered_map<size_t, CacheEntry> query_cache_;
    std::list<size_t> query_cache_lru_;

    size_t cache_key(const std::string& question) const;
    // Devuelve la respuesta cacheada valida (dentro del TTL) o nullopt.
    std::optional<std::string> cache_lookup(size_t key);
    void cache_store(size_t key, const std::string& answer);

    // Generar respuesta (conocimiento general)
    QueryResult generate_response(const std::string& question,
                                   const std::string& conversation_context);

    // Construir prompt con plantilla
    std::string build_prompt(const std::string& template_str,
                              const std::string& context,
                              const std::string& question);

    // Sustituir variables de perfil de usuario en prompt
    std::string apply_user_profile(const std::string& prompt);

    // --- Lazy loading del modelo ---
    std::string             pending_model_path_;       // ruta del modelo a cargar en demanda
    std::mutex              model_load_mutex_;          // protege carga/descarga concurrente del modelo
    std::thread             idle_monitor_thread_;       // hilo que vigila inactividad
    std::atomic<bool>       stop_monitor_{ false };     // senal de parada para el hilo monitor
    ModelLifecycle          lifecycle_;                 // maquina de estados IDLE/LOADING/PROCESSING

    LLMConfig build_llm_config(const std::string& model_path, int gpu_layers_override = -1);
    void ensure_model_loaded();   // carga el modelo si no esta cargado
    void warmup_model();          // genera 1 token tras carga para compilar kernels CUDA
    void start_idle_monitor();    // arranca el hilo monitor
    void stop_idle_monitor();     // para y une el hilo monitor
};

} // namespace alfred
