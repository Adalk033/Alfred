// ============================================================================
// config.h - Configuracion global y plantillas de prompt
// ============================================================================
// Equivalente a: OldProject/backend/core/config.py
// Contiene la configuracion de la aplicacion y los templates de prompt
// que el LLM usa para generar respuestas en espanol.
// ============================================================================
#pragma once

#include <string>
#include <chrono>

namespace alfred {

// Configuracion central de la aplicacion
struct AppConfig {
    // --- Servidor HTTP ---
    std::string host = "127.0.0.1";
    int port = 8000;

    // --- Rutas (resueltas en runtime por paths.h) ---
    std::string data_dir;
    std::string db_path;
    std::string models_dir;
    std::string docs_dir;
    std::string logs_dir;


    // --- LLM (llama.cpp con CUDA) ---
    // Modelos GGUF seleccionados por el usuario (vacio = sin modelo por defecto)
    std::string llm_model_file;
    int n_ctx           = 4096;
    int n_gpu_layers    = 99;     // Offload todas las capas a GPU
    int n_batch         = 512;
    int n_threads       = 0;      // 0 = auto (cores fisicos)
    float temperature   = 0.7f;
    float top_p         = 0.9f;
    int max_tokens      = 2048;
    int seed            = -1;     // -1 = aleatorio

    // --- Cache de consultas ---
    int query_cache_max          = 50;
    int query_cache_ttl_seconds  = 300;

    // --- Perfil de usuario (cargado de DB) ---
    std::string user_name;
    std::string user_age;
    std::string user_occupation;
    std::string about_user;
};

// Plantilla de prompt (respuestas siempre en espanol)
extern const std::string PROMPT_TEMPLATE_NO_DOCUMENTS;

// Singleton de configuracion
AppConfig& get_config();

// Obtener fecha/hora actual formateada
std::string get_current_datetime();

} // namespace alfred
