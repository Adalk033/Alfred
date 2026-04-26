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
    int n_ctx           = 2048;
    int n_gpu_layers    = 20;
    int n_batch         = 128;   // batch logico (tokens por llama_decode)
    int n_ubatch        = 0;     // micro-batch (0 = usar n_batch)
    int n_threads       = 0;     // 0 = auto (cores fisicos)
    int n_threads_batch = 0;     // 0 = igual a n_threads

    // --- Aceleracion GPU ---
    int  flash_attn     = -1;    // -1 auto, 0 off, 1 on
    bool offload_kqv    = true;  // KV cache en GPU
    bool use_mmap       = true;
    bool use_mlock      = false;

    // --- KV cache quantization ---
    // "f16" (default), "q8_0" (~50% VRAM), "q4_0" (~25% VRAM)
    std::string cache_type_k = "f16";
    std::string cache_type_v = "f16";

    // --- Sampling ---
    float temperature    = 0.7f;
    float top_p          = 0.9f;
    int   top_k          = 40;
    float min_p          = 0.05f;
    float repeat_penalty = 1.10f;
    int   repeat_last_n  = 64;
    int   max_tokens     = 1024;
    int   seed           = -1;
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
    int context_length() const;

    // Cuenta tokens reales usando el tokenizer del modelo cargado.
    // Devuelve -1 si no hay modelo. No agrega BOS ni tokens especiales salvo
    // que el texto los contenga literalmente.
    int count_tokens(const std::string& text) const;

    // Ultimo error de carga
    std::string last_error() const;

    // Cambiar parametros de sampling sin recargar modelo
    void set_temperature(float temp);
    void set_top_p(float top_p);
    void set_max_tokens(int max_tokens);
    void set_top_k(int v);
    void set_min_p(float v);
    void set_repeat_penalty(float v);
    void set_repeat_last_n(int v);

private:
    llama_model* model_ = nullptr;
    llama_context* ctx_ = nullptr;
    LLMConfig config_;
    std::string model_name_;
    std::string last_error_;

    // Prefix caching: tokens de la ultima generacion para detectar prefijo comun
    std::vector<int32_t> last_tokens_;

    // Tokenizar texto
    std::vector<int32_t> tokenize(const std::string& text, bool add_bos = true);

    // Detokenizar token individual
    std::string token_to_string(int32_t token);

    // Crear sampler chain
    llama_sampler* create_sampler();

    // Detecta head_dim de la K-cache leyendo metadatos GGUF. 0 si no se sabe.
    int detect_head_dim_k() const;

    void cleanup();
};

} // namespace alfred
