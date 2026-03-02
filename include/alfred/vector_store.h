// ============================================================================
// vector_store.h - Almacen vectorial con hnswlib
// ============================================================================
// Equivalente a: OldProject/backend/core/vector_manager.py
// Reemplaza ChromaDB con hnswlib (busqueda vectorial en memoria).
// Metadatos persistidos en SQLite, indices HNSW en disco.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <mutex>

namespace alfred {

struct VectorEntry {
    size_t id = 0;
    std::vector<float> embedding;
    std::string content;
    std::string source_file;
    int chunk_index = 0;
    std::string doc_type;
};

struct VectorSearchResult {
    size_t id = 0;
    float distance = 0.0f;
    float score = 0.0f;       // 1/(1+distance), normalizado 0-1
    std::string content;
    std::string source_file;
    int chunk_index = 0;
};

class VectorStore {
public:
    VectorStore();
    ~VectorStore();

    // No copiable
    VectorStore(const VectorStore&) = delete;
    VectorStore& operator=(const VectorStore&) = delete;

    // Inicializar con dimension y ruta de persistencia
    bool initialize(int dimension, const std::string& persist_dir,
                    size_t max_elements = 100000);

    // Cargar indice existente desde disco
    bool load();

    // Guardar indice a disco
    bool save();

    // Agregar vectores
    void add(const std::vector<VectorEntry>& entries);
    void add_single(const VectorEntry& entry);

    // Buscar K vecinos mas cercanos
    std::vector<VectorSearchResult> search(const std::vector<float>& query,
                                            int k = 10);

    // Buscar con filtro por source_file
    std::vector<VectorSearchResult> search_filtered(
        const std::vector<float>& query, int k,
        const std::string& source_filter);

    // Eliminar vectores por source_file
    void remove_by_source(const std::string& source_file);

    // Limpiar todo el indice
    void clear();

    // Estadisticas
    size_t count() const;
    int dimension() const;
    bool is_initialized() const;
    std::string stats_json() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    mutable std::mutex mutex_;
};

} // namespace alfred
