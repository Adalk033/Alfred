// ============================================================================
// llm_engine.h - Motor de inferencia LLM via llama.cpp
// ============================================================================
// REEMPLAZA OLLAMA COMPLETAMENTE
// Carga modelos GGUF de HuggingFace directamente usando llama.cpp.
// Soporte nativo CUDA para inferencia acelerada por GPU.
//
// Modelos recomendados (descargar de HuggingFace en formato GGUF):
//   - gemma-2-9b-it (Q5_K_M para 16GB+ VRAM, Q4_K_M para 8GB)
//   - llama-3.1-8b-instruct (alternativa)
//   - mistral-7b-instruct (alternativa ligera)
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>

// Forward declarations de llama.cpp
struct llama_model;
struct llama_context;
struct llama_sampler;
struct llama_vocab;

namespace alfred {

struct LLMConfig {
    std::string model_path;
    int n_ctx         = 4096;
    int n_gpu_layers  = 99;
    int n_batch       = 512;
    float temperature = 0.7f;
    float top_p       = 0.9f;
    int max_tokens    = 2048;
    int seed          = -1;
};

struct LLMResult {
    std::string text;
    int tokens_generated = 0;
    int tokens_prompt = 0;
    double generation_time_ms = 0.0;
    bool success = true;
    std::string error;
};

// Callback para streaming de tokens
using TokenCallback = std::function<bool(const std::string& token)>;

class LLMEngine {
public:
    LLMEngine();
    ~LLMEngine();

    // No copiable, movible
    LLMEngine(const LLMEngine&) = delete;
    LLMEngine& operator=(const LLMEngine&) = delete;
    LLMEngine(LLMEngine&& other) noexcept;
    LLMEngine& operator=(LLMEngine&& other) noexcept;

    // Cargar modelo GGUF
    bool load_model(const LLMConfig& config);

    // Descargar modelo de memoria
    void unload_model();

    // Verificar si hay modelo cargado
    bool is_loaded() const;

    // Generar respuesta completa
    LLMResult generate(const std::string& prompt);

    // Generar con streaming (callback recibe cada token)
    LLMResult generate_streaming(const std::string& prompt, TokenCallback callback);

    // Obtener info del modelo cargado
    std::string model_name() const;
    size_t model_size_mb() const;
    int context_length() const;

    // Cambiar parametros de sampling sin recargar modelo
    void set_temperature(float temp);
    void set_top_p(float top_p);
    void set_max_tokens(int max_tokens);

private:
    llama_model* model_ = nullptr;
    llama_context* ctx_ = nullptr;
    LLMConfig config_;
    std::string model_name_;

    // Tokenizar texto
    std::vector<int32_t> tokenize(const std::string& text, bool add_bos = true);

    // Detokenizar token individual
    std::string token_to_string(int32_t token);

    // Crear sampler chain
    llama_sampler* create_sampler();

    void cleanup();
};

} // namespace alfred
