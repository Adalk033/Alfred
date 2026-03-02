// ============================================================================
// alfred_core.h - Pipeline RAG central
// ============================================================================
// Equivalente a: OldProject/backend/core/alfred_core.py
// Orquesta todo el pipeline: query -> cache -> history -> retrieve -> LLM
// Con/sin documentos, expansion de query, extraccion de datos personales.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <mutex>
#include <nlohmann/json.hpp>

#include "alfred/llm_engine.h"
#include "alfred/embedding_engine.h"
#include "alfred/vector_store.h"
#include "alfred/retriever.h"
#include "alfred/document_loader.h"
#include "alfred/chunking.h"

namespace alfred {

using json = nlohmann::json;

struct QueryResult {
    std::string answer;
    std::string sources;            // JSON array de fuentes
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

    // Inicializar todos los componentes (GPU, LLM, embeddings, vectorstore)
    bool initialize();

    // Query principal - el punto de entrada para todas las consultas
    QueryResult query(const std::string& question,
                      bool use_history = true,
                      bool search_documents = true,
                      const std::string& conversation_id = "");

    // Indexar documentos desde un directorio
    json index_documents(const std::string& docs_path, bool force_reindex = false);

    // Re-indexar todos los documentos
    json reindex_all();

    // Eliminar documentos de un directorio
    void delete_documents(const std::string& dir_path);

    // Cambiar modelo LLM
    bool change_model(const std::string& model_path);

    // Cambiar modelo de embeddings
    bool change_embedder(const std::string& model_path);

    // Estadisticas generales
    json get_stats();

    // Cache
    void clear_cache();
    json get_cache_stats();

    // Test de busqueda directa
    json test_search(const std::string& query, int k = 5);

    // Acceso a componentes
    LLMEngine& llm();
    EmbeddingEngine& embedder();
    VectorStore& vector_store();
    bool is_initialized() const;

private:
    std::unique_ptr<LLMEngine> llm_;
    std::unique_ptr<EmbeddingEngine> embedder_;
    std::unique_ptr<VectorStore> vector_store_;
    std::unique_ptr<SemanticRetriever> retriever_;
    DocumentLoader doc_loader_;

    bool initialized_ = false;

    // Cache LRU
    std::unordered_map<size_t, CacheEntry> query_cache_;
    std::mutex cache_mutex_;

    // Generar respuesta con documentos
    QueryResult generate_with_documents(const std::string& question,
                                         const std::string& conversation_context);

    // Generar respuesta sin documentos (conocimiento general)
    QueryResult generate_without_documents(const std::string& question,
                                            const std::string& conversation_context);

    // Expandir query para mejor busqueda semantica
    std::string expand_query(const std::string& question);

    // Determinar si se debe expandir la query
    bool should_expand_query(const std::string& question);

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
