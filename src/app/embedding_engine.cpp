// ============================================================================
// embedding_engine.cpp - Motor de embeddings via llama.cpp
// ============================================================================
// Genera embeddings usando modelos GGUF en modo embedding.
// Reemplaza OllamaEmbeddings - todo se ejecuta localmente con CUDA.
// ============================================================================
#include "alfred/embedding_engine.h"
#include "alfred/logger.h"

#include "llama.h"

#include <chrono>
#include <cmath>
#include <numeric>

namespace alfred {

EmbeddingEngine::EmbeddingEngine() = default;

EmbeddingEngine::~EmbeddingEngine() {
    cleanup();
}

void EmbeddingEngine::cleanup() {
    if (ctx_) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_) {
        llama_model_free(model_);
        model_ = nullptr;
    }
}

bool EmbeddingEngine::load_model(const EmbeddingConfig& config) {
    cleanup();
    config_ = config;

    log_info("Cargando modelo de embeddings: " + config.model_path);

    // Parametros del modelo
    auto model_params = llama_model_default_params();
    model_params.n_gpu_layers = config.n_gpu_layers;

    auto start = std::chrono::steady_clock::now();

    model_ = llama_model_load_from_file(config.model_path.c_str(), model_params);
    if (!model_) {
        log_error("Error cargando modelo de embeddings: " + config.model_path);
        return false;
    }

    // Contexto en modo embedding
    auto ctx_params = llama_context_default_params();
    ctx_params.n_ctx = static_cast<uint32_t>(config.n_batch);
    ctx_params.n_batch = static_cast<uint32_t>(config.n_batch);
    ctx_params.n_threads = 4;
    ctx_params.embeddings = true;  // Modo embedding activo

    ctx_ = llama_init_from_model(model_, ctx_params);
    if (!ctx_) {
        log_error("Error creando contexto de embeddings");
        llama_model_free(model_);
        model_ = nullptr;
        return false;
    }

    // Determinar dimension real de embeddings
    actual_dim_ = llama_model_n_embd(model_);
    if (actual_dim_ <= 0) {
        actual_dim_ = config.embedding_dim;
    }

    auto end = std::chrono::steady_clock::now();
    double ms = std::chrono::duration<double, std::milli>(end - start).count();

    // Nombre del modelo
    auto pos = config.model_path.find_last_of("/\\");
    model_name_ = (pos != std::string::npos)
        ? config.model_path.substr(pos + 1)
        : config.model_path;

    log_info("Modelo embeddings cargado en " + std::to_string(static_cast<int>(ms)) +
             "ms: " + model_name_ + " (dim=" + std::to_string(actual_dim_) + ")");
    return true;
}

void EmbeddingEngine::unload_model() {
    cleanup();
    model_name_.clear();
    actual_dim_ = 0;
    log_info("Modelo de embeddings descargado");
}

bool EmbeddingEngine::is_loaded() const {
    return model_ != nullptr && ctx_ != nullptr;
}

std::vector<int32_t> EmbeddingEngine::tokenize(const std::string& text) {
    if (!model_) return {};

    int max_tokens = static_cast<int>(text.size()) + 64;
    std::vector<int32_t> tokens(static_cast<size_t>(max_tokens));

    const llama_vocab* vocab = llama_model_get_vocab(model_);
    int n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()),
                           tokens.data(), max_tokens, true, false);
    if (n < 0) {
        max_tokens = -n + 16;
        tokens.resize(static_cast<size_t>(max_tokens));
        n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()),
                           tokens.data(), max_tokens, true, false);
    }

    if (n > 0) tokens.resize(static_cast<size_t>(n));
    else tokens.clear();
    return tokens;
}

std::vector<float> EmbeddingEngine::embed(const std::string& text) {
    if (!is_loaded()) return {};

    auto tokens = tokenize(text);
    if (tokens.empty()) return {};

    // Limpiar estado
    llama_memory_clear(llama_get_memory(ctx_), true);

    // Crear batch con los tokens
    llama_batch batch = llama_batch_init(config_.n_batch, 0, 1);

    for (size_t i = 0; i < tokens.size(); ++i) {
        batch.token[batch.n_tokens] = tokens[i];
        batch.pos[batch.n_tokens] = static_cast<int32_t>(i);
        batch.n_seq_id[batch.n_tokens] = 1;
        batch.seq_id[batch.n_tokens][0] = 0;
        batch.logits[batch.n_tokens] = 1;
        batch.n_tokens++;
    }

    // Decodificar
    if (llama_decode(ctx_, batch) != 0) {
        log_error("Error generando embedding");
        llama_batch_free(batch);
        return {};
    }

    // Obtener embedding de la secuencia
    const float* emb = llama_get_embeddings_seq(ctx_, 0);
    if (!emb) {
        // Fallback: obtener embeddings del ultimo token
        emb = llama_get_embeddings_ith(ctx_, batch.n_tokens - 1);
    }

    llama_batch_free(batch);

    if (!emb) {
        log_error("No se pudieron obtener embeddings");
        return {};
    }

    // Copiar y normalizar (L2)
    std::vector<float> embedding(emb, emb + actual_dim_);

    // Normalizacion L2
    float norm = 0.0f;
    for (float v : embedding) norm += v * v;
    norm = std::sqrt(norm);

    if (norm > 0.0f) {
        for (float& v : embedding) v /= norm;
    }

    return embedding;
}

std::vector<std::vector<float>> EmbeddingEngine::embed_batch(
    const std::vector<std::string>& texts) {
    std::vector<std::vector<float>> results;
    results.reserve(texts.size());

    // Por ahora, procesamiento secuencial
    // Optimizacion futura: batch processing real
    for (const auto& text : texts) {
        results.push_back(embed(text));
    }

    return results;
}

int EmbeddingEngine::dimension() const {
    return actual_dim_ > 0 ? actual_dim_ : config_.embedding_dim;
}

std::string EmbeddingEngine::model_name() const {
    return model_name_;
}

} // namespace alfred
