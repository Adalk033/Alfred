// ============================================================================
// retriever.cpp - Recuperacion semantica de documentos
// ============================================================================
// Busqueda con MMR (Maximal Marginal Relevance) para diversidad.
// ============================================================================
#include "alfred/retriever.h"
#include "alfred/logger.h"
#include "alfred/string_utils.h"

#include <chrono>
#include <cmath>
#include <numeric>
#include <algorithm>
#include <unordered_set>
#include <sstream>
#include <filesystem>

namespace alfred {

SemanticRetriever::SemanticRetriever(VectorStore& store, EmbeddingEngine& embedder)
    : store_(store), embedder_(embedder) {}

float SemanticRetriever::cosine_similarity(const std::vector<float>& a,
                                            const std::vector<float>& b) {
    if (a.size() != b.size() || a.empty()) return 0.0f;

    float dot = 0.0f, norm_a = 0.0f, norm_b = 0.0f;
    for (size_t i = 0; i < a.size(); ++i) {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    float denom = std::sqrt(norm_a) * std::sqrt(norm_b);
    if (denom == 0.0f) return 0.0f;
    return dot / denom;
}

std::vector<VectorSearchResult> SemanticRetriever::mmr_rerank(
    const std::vector<VectorSearchResult>& candidates,
    const std::vector<float>& query_embedding,
    int k, float lambda) {

    if (candidates.empty()) return {};

    std::vector<VectorSearchResult> selected;
    std::vector<bool> used(candidates.size(), false);

    // Necesitamos los embeddings de los candidatos para calcular diversidad.
    // Como no los tenemos almacenados, usamos re-embedding del contenido.
    // Optimizacion: almacenar embeddings en vector_store para evitar re-computo.
    std::vector<std::vector<float>> candidate_embeddings;
    for (const auto& cand : candidates) {
        auto emb = embedder_.embed(cand.content);
        candidate_embeddings.push_back(std::move(emb));
    }

    for (int i = 0; i < k && i < static_cast<int>(candidates.size()); ++i) {
        float best_score = -1.0f;
        int best_idx = -1;

        for (int j = 0; j < static_cast<int>(candidates.size()); ++j) {
            if (used[static_cast<size_t>(j)]) continue;

            // Relevancia: similitud con la query
            float relevance = 0.0f;
            if (!candidate_embeddings[static_cast<size_t>(j)].empty()) {
                relevance = cosine_similarity(query_embedding,
                                              candidate_embeddings[static_cast<size_t>(j)]);
            } else {
                relevance = candidates[static_cast<size_t>(j)].score;
            }

            // Diversidad: max similitud con documentos ya seleccionados
            float max_sim_to_selected = 0.0f;
            for (const auto& sel : selected) {
                // Buscar el embedding del seleccionado
                for (int s = 0; s < static_cast<int>(candidates.size()); ++s) {
                    if (candidates[static_cast<size_t>(s)].id == sel.id) {
                        float sim = cosine_similarity(
                            candidate_embeddings[static_cast<size_t>(j)],
                            candidate_embeddings[static_cast<size_t>(s)]);
                        max_sim_to_selected = std::max(max_sim_to_selected, sim);
                        break;
                    }
                }
            }

            // Score MMR: lambda * relevancia - (1-lambda) * max_similitud_ya_seleccionados
            float mmr_score = lambda * relevance - (1.0f - lambda) * max_sim_to_selected;

            if (mmr_score > best_score) {
                best_score = mmr_score;
                best_idx = j;
            }
        }

        if (best_idx >= 0) {
            used[static_cast<size_t>(best_idx)] = true;
            selected.push_back(candidates[static_cast<size_t>(best_idx)]);
        }
    }

    return selected;
}

RetrievalResult SemanticRetriever::retrieve(const std::string& query,
                                             const RetrievalConfig& config) {
    RetrievalResult result;
    result.query = query;

    auto start = std::chrono::steady_clock::now();

    // Generar embedding de la query
    auto query_embedding = embedder_.embed(query);
    if (query_embedding.empty()) {
        log_error("Error generando embedding para query");
        return result;
    }

    // Buscar candidatos
    auto candidates = store_.search(query_embedding, config.fetch_k);
    result.total_results = static_cast<int>(candidates.size());

    // Filtrar por threshold
    std::vector<VectorSearchResult> filtered;
    for (auto& cand : candidates) {
        if (cand.score >= config.score_threshold) {
            filtered.push_back(std::move(cand));
        }
    }

    // Aplicar MMR para diversidad
    if (config.mmr_diversity < 1.0f && filtered.size() > static_cast<size_t>(config.k)) {
        result.documents = mmr_rerank(filtered, query_embedding,
                                       config.k, 1.0f - config.mmr_diversity);
    } else {
        // Sin MMR, tomar top-k
        if (static_cast<int>(filtered.size()) > config.k) {
            filtered.resize(static_cast<size_t>(config.k));
        }
        result.documents = std::move(filtered);
    }

    result.filtered_results = static_cast<int>(result.documents.size());

    auto end = std::chrono::steady_clock::now();
    result.retrieval_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    log_debug("Retrieval: " + std::to_string(result.filtered_results) + "/" +
              std::to_string(result.total_results) + " docs en " +
              std::to_string(static_cast<int>(result.retrieval_time_ms)) + "ms");

    return result;
}

RetrievalResult SemanticRetriever::retrieve_multiple(
    const std::vector<std::string>& queries, const RetrievalConfig& config) {

    RetrievalResult combined;
    combined.query = join(queries, " | ");

    for (const auto& q : queries) {
        auto result = retrieve(q, config);
        combined.documents.insert(combined.documents.end(),
                                  result.documents.begin(), result.documents.end());
        combined.total_results += result.total_results;
        combined.retrieval_time_ms += result.retrieval_time_ms;
    }

    // Deduplicar y re-ranking
    combined.documents = deduplicate(combined.documents);
    combined.documents = rerank(combined.documents, config.k);
    combined.filtered_results = static_cast<int>(combined.documents.size());

    return combined;
}

std::string SemanticRetriever::format_context(
    const std::vector<VectorSearchResult>& docs, int max_length) {

    std::ostringstream oss;
    int current_length = 0;

    for (int i = 0; i < static_cast<int>(docs.size()); ++i) {
        std::string fragment = "[Fragmento " + std::to_string(i + 1) + "] ";

        if (!docs[static_cast<size_t>(i)].source_file.empty()) {
            // Extraer solo nombre del archivo
            std::filesystem::path p(docs[static_cast<size_t>(i)].source_file);
            fragment += "(fuente: " + p.filename().string() + ")\n";
        }

        fragment += docs[static_cast<size_t>(i)].content + "\n\n";

        if (current_length + static_cast<int>(fragment.size()) > max_length) {
            break;
        }

        oss << fragment;
        current_length += static_cast<int>(fragment.size());
    }

    return oss.str();
}

std::vector<VectorSearchResult> SemanticRetriever::rerank(
    std::vector<VectorSearchResult>& docs, int top_k) {
    std::sort(docs.begin(), docs.end(),
              [](const VectorSearchResult& a, const VectorSearchResult& b) {
                  return a.score > b.score;
              });

    if (static_cast<int>(docs.size()) > top_k) {
        docs.resize(static_cast<size_t>(top_k));
    }
    return docs;
}

std::vector<VectorSearchResult> SemanticRetriever::deduplicate(
    const std::vector<VectorSearchResult>& docs) {

    std::vector<VectorSearchResult> unique;
    std::unordered_set<std::string> seen_hashes;

    for (const auto& doc : docs) {
        std::string hash = sha256_string(doc.content);
        if (seen_hashes.insert(hash).second) {
            unique.push_back(doc);
        }
    }

    return unique;
}

void SemanticRetriever::update_config(const RetrievalConfig& config) {
    default_config_ = config;
}

} // namespace alfred
