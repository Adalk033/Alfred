// ============================================================================
// retriever.h - Recuperacion semantica de documentos
// ============================================================================
// Equivalente a: OldProject/backend/core/retriever.py
// Busqueda semantica con MMR (Maximal Marginal Relevance) para diversidad.
// Score: 1/(1+distance), filtrado por threshold, deduplicacion por contenido.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>
#include "alfred/vector_store.h"
#include "alfred/embedding_engine.h"

namespace alfred {

struct RetrievalConfig {
    int k = 20;               // Documentos a retornar
    int fetch_k = 40;         // Candidatos para MMR
    float score_threshold = 0.0f;
    float mmr_diversity = 0.3f;  // Lambda para MMR (0=max diversidad, 1=max relevancia)
};

struct RetrievalResult {
    std::vector<VectorSearchResult> documents;
    std::string query;
    int total_results = 0;
    int filtered_results = 0;
    double retrieval_time_ms = 0.0;
};

class SemanticRetriever {
public:
    SemanticRetriever(VectorStore& store, EmbeddingEngine& embedder);

    // Buscar documentos relevantes para una query
    RetrievalResult retrieve(const std::string& query,
                              const RetrievalConfig& config = {});

    // Buscar con multiples queries (para query expansion)
    RetrievalResult retrieve_multiple(const std::vector<std::string>& queries,
                                       const RetrievalConfig& config = {});

    // Formatear documentos como contexto para el prompt
    // Formato: "[Fragmento N] (fuente: archivo.txt)\ncontenido..."
    std::string format_context(const std::vector<VectorSearchResult>& docs,
                                int max_length = 8000);

    // Re-ranking por relevancia
    std::vector<VectorSearchResult> rerank(std::vector<VectorSearchResult>& docs,
                                            int top_k);

    // Deduplicar documentos por contenido
    std::vector<VectorSearchResult> deduplicate(
        const std::vector<VectorSearchResult>& docs);

    // Actualizar configuracion
    void update_config(const RetrievalConfig& config);

private:
    VectorStore& store_;
    EmbeddingEngine& embedder_;
    RetrievalConfig default_config_;

    // MMR: Maximal Marginal Relevance
    std::vector<VectorSearchResult> mmr_rerank(
        const std::vector<VectorSearchResult>& candidates,
        const std::vector<float>& query_embedding,
        int k, float lambda);

    // Coseno similarity entre dos vectores
    static float cosine_similarity(const std::vector<float>& a,
                                    const std::vector<float>& b);
};

} // namespace alfred
