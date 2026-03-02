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
    std::string chroma_dir;

    // --- LLM (llama.cpp con CUDA) ---
    // Modelos GGUF seleccionados por el usuario (vacio = sin modelo por defecto)
    std::string llm_model_file;
    std::string embed_model_file;
    int n_ctx           = 4096;
    int n_gpu_layers    = 99;     // Offload todas las capas a GPU
    int n_batch         = 512;
    float temperature   = 0.7f;
    float top_p         = 0.9f;
    int max_tokens      = 2048;
    int seed            = -1;     // -1 = aleatorio

    // --- Embeddings ---
    int embedding_dim   = 768;

    // --- Chunking (estrategias de fragmentacion) ---
    int chunk_size_text      = 600;
    int chunk_overlap_text   = 100;
    int chunk_size_code      = 500;
    int chunk_overlap_code   = 100;
    int chunk_size_document  = 800;
    int chunk_overlap_document = 150;

    // --- Retrieval (busqueda semantica) ---
    int default_k           = 20;
    int fetch_k             = 40;
    float score_threshold   = 0.0f;
    float mmr_diversity     = 0.3f;

    // --- Cache de consultas ---
    int query_cache_max          = 50;
    int query_cache_ttl_seconds  = 300;

    // --- Perfil de usuario (cargado de DB) ---
    std::string user_name;
    std::string user_age;
    std::string user_occupation;
    std::string about_user;
};

// Plantillas de prompt (respuestas siempre en espanol)
extern const std::string PROMPT_TEMPLATE_NO_DOCUMENTS;
extern const std::string PROMPT_TEMPLATE_WITH_DOCUMENTS;

// Singleton de configuracion
AppConfig& get_config();

// Obtener fecha/hora actual formateada
std::string get_current_datetime();

} // namespace alfred
