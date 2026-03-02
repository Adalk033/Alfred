// ============================================================================
// embedding_engine.h - Motor de embeddings via llama.cpp
// ============================================================================
// Equivalente a: OldProject/backend/core/embedding_manager.py
// Genera embeddings vectoriales usando modelos GGUF via llama.cpp.
// Reemplaza OllamaEmbeddings de LangChain.
//
// Modelos recomendados (GGUF desde HuggingFace):
//   - nomic-embed-text-v1.5 (768 dims, buena calidad)
//   - all-MiniLM-L6-v2 (384 dims, rapido)
//   - bge-large-en-v1.5 (1024 dims, alta calidad)
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>

// Forward declarations
struct llama_model;
struct llama_context;
struct llama_vocab;

namespace alfred {

struct EmbeddingConfig {
    std::string model_path;
    int n_gpu_layers = 99;
    int n_batch = 512;
    int embedding_dim = 768;    // Dimension de salida del modelo
};

class EmbeddingEngine {
public:
    EmbeddingEngine();
    ~EmbeddingEngine();

    // No copiable
    EmbeddingEngine(const EmbeddingEngine&) = delete;
    EmbeddingEngine& operator=(const EmbeddingEngine&) = delete;

    // Cargar modelo de embeddings
    bool load_model(const EmbeddingConfig& config);
    void unload_model();
    bool is_loaded() const;

    // Generar embedding para un texto
    std::vector<float> embed(const std::string& text);

    // Generar embeddings para multiples textos (batch)
    std::vector<std::vector<float>> embed_batch(const std::vector<std::string>& texts);

    // Dimension del embedding
    int dimension() const;

    // Info del modelo
    std::string model_name() const;

private:
    llama_model* model_ = nullptr;
    llama_context* ctx_ = nullptr;
    EmbeddingConfig config_;
    std::string model_name_;
    int actual_dim_ = 0;

    std::vector<int32_t> tokenize(const std::string& text);
    void cleanup();
};

} // namespace alfred
