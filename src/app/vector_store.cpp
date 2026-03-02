// ============================================================================
// vector_store.cpp - Almacen vectorial con hnswlib
// ============================================================================
// Reemplaza ChromaDB con hnswlib (en memoria, persistido en disco).
// Los metadatos (contenido, fuente) se guardan en mapas auxiliares
// que se serializan junto con el indice HNSW.
// ============================================================================
#include "alfred/vector_store.h"
#include "alfred/logger.h"

#ifdef __GNUC__
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wconversion"
#pragma GCC diagnostic ignored "-Wshadow"
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#endif

#include "hnswlib/hnswlib.h"

#ifdef __GNUC__
#pragma GCC diagnostic pop
#endif

#include <fstream>
#include <algorithm>
#include <filesystem>
#include <nlohmann/json.hpp>

namespace alfred {

namespace fs = std::filesystem;
using json = nlohmann::json;

// Implementacion interna (PIMPL)
struct VectorStore::Impl {
    std::unique_ptr<hnswlib::L2Space> space;
    std::unique_ptr<hnswlib::HierarchicalNSW<float>> index;

    // Metadatos por ID
    std::unordered_map<size_t, std::string> content_map;      // id -> contenido del chunk
    std::unordered_map<size_t, std::string> source_map;       // id -> archivo fuente
    std::unordered_map<size_t, int> chunk_index_map;           // id -> indice del chunk

    std::string persist_dir;
    int dimension = 0;
    size_t max_elements = 100000;
    size_t next_id = 0;
    bool initialized = false;
};

VectorStore::VectorStore() : impl_(std::make_unique<Impl>()) {}
VectorStore::~VectorStore() = default;

bool VectorStore::initialize(int dimension, const std::string& persist_dir,
                              size_t max_elements) {
    std::lock_guard<std::mutex> lock(mutex_);

    impl_->dimension = dimension;
    impl_->persist_dir = persist_dir;
    impl_->max_elements = max_elements;

    // Crear directorio si no existe
    if (!fs::exists(persist_dir)) {
        fs::create_directories(persist_dir);
    }

    // Intentar cargar indice existente
    if (load()) {
        return true;
    }

    // Crear nuevo indice
    impl_->space = std::make_unique<hnswlib::L2Space>(static_cast<size_t>(dimension));
    impl_->index = std::make_unique<hnswlib::HierarchicalNSW<float>>(
        impl_->space.get(), max_elements, 16, 200);

    impl_->next_id = 0;
    impl_->initialized = true;

    log_info("Vector store inicializado (dim=" + std::to_string(dimension) +
             ", max=" + std::to_string(max_elements) + ")");
    return true;
}

bool VectorStore::load() {
    std::string index_path = impl_->persist_dir + "/hnsw.index";
    std::string meta_path = impl_->persist_dir + "/metadata.json";

    if (!fs::exists(index_path) || !fs::exists(meta_path)) {
        return false;
    }

    try {
        // Cargar space
        impl_->space = std::make_unique<hnswlib::L2Space>(
            static_cast<size_t>(impl_->dimension));

        // Cargar indice HNSW
        impl_->index = std::make_unique<hnswlib::HierarchicalNSW<float>>(
            impl_->space.get(), index_path);

        // Cargar metadatos
        std::ifstream meta_file(meta_path);
        json meta = json::parse(meta_file);

        impl_->next_id = meta.value("next_id", static_cast<size_t>(0));

        // Cargar mapas de metadatos
        if (meta.contains("entries")) {
            for (const auto& [id_str, entry] : meta["entries"].items()) {
                size_t id = std::stoull(id_str);
                impl_->content_map[id] = entry.value("content", "");
                impl_->source_map[id] = entry.value("source", "");
                impl_->chunk_index_map[id] = entry.value("chunk_index", 0);
            }
        }

        impl_->initialized = true;
        log_info("Vector store cargado desde disco (" +
                 std::to_string(impl_->content_map.size()) + " vectores)");
        return true;
    } catch (const std::exception& e) {
        log_error("Error cargando vector store: " + std::string(e.what()));
        return false;
    }
}

bool VectorStore::save() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!impl_->initialized || !impl_->index) return false;

    try {
        std::string index_path = impl_->persist_dir + "/hnsw.index";
        std::string meta_path = impl_->persist_dir + "/metadata.json";

        // Guardar indice HNSW
        impl_->index->saveIndex(index_path);

        // Guardar metadatos
        json meta;
        meta["next_id"] = impl_->next_id;
        meta["dimension"] = impl_->dimension;

        json entries;
        for (const auto& [id, content] : impl_->content_map) {
            json entry;
            entry["content"] = content;
            entry["source"] = impl_->source_map.count(id) ? impl_->source_map[id] : "";
            entry["chunk_index"] = impl_->chunk_index_map.count(id) ? impl_->chunk_index_map[id] : 0;
            entries[std::to_string(id)] = entry;
        }
        meta["entries"] = entries;

        std::ofstream meta_file(meta_path);
        meta_file << meta.dump(2);

        log_debug("Vector store guardado en disco");
        return true;
    } catch (const std::exception& e) {
        log_error("Error guardando vector store: " + std::string(e.what()));
        return false;
    }
}

void VectorStore::add(const std::vector<VectorEntry>& entries) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!impl_->initialized) return;

    for (const auto& entry : entries) {
        if (entry.embedding.size() != static_cast<size_t>(impl_->dimension)) {
            log_warn("Embedding dimension mismatch, esperado " +
                     std::to_string(impl_->dimension) + " pero recibido " +
                     std::to_string(entry.embedding.size()));
            continue;
        }

        size_t id = impl_->next_id++;

        // Verificar si necesitamos expandir el indice
        if (id >= impl_->max_elements) {
            impl_->index->resizeIndex(impl_->max_elements * 2);
            impl_->max_elements *= 2;
        }

        impl_->index->addPoint(entry.embedding.data(), id);
        impl_->content_map[id] = entry.content;
        impl_->source_map[id] = entry.source_file;
        impl_->chunk_index_map[id] = entry.chunk_index;
    }
}

void VectorStore::add_single(const VectorEntry& entry) {
    add({entry});
}

std::vector<VectorSearchResult> VectorStore::search(
    const std::vector<float>& query, int k) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<VectorSearchResult> results;
    if (!impl_->initialized || !impl_->index) return results;
    if (impl_->index->cur_element_count == 0) return results;

    // Ajustar k al numero de elementos disponibles
    size_t actual_k = std::min(static_cast<size_t>(k),
                               static_cast<size_t>(impl_->index->cur_element_count.load()));

    try {
        auto result = impl_->index->searchKnn(query.data(), actual_k);

        // El resultado es un priority_queue (max-heap por distancia)
        while (!result.empty()) {
            auto [distance, id] = result.top();
            result.pop();

            VectorSearchResult sr;
            sr.id = id;
            sr.distance = distance;
            sr.score = 1.0f / (1.0f + distance); // Convertir distancia a score

            auto content_it = impl_->content_map.find(id);
            if (content_it != impl_->content_map.end()) {
                sr.content = content_it->second;
            }

            auto source_it = impl_->source_map.find(id);
            if (source_it != impl_->source_map.end()) {
                sr.source_file = source_it->second;
            }

            auto chunk_it = impl_->chunk_index_map.find(id);
            if (chunk_it != impl_->chunk_index_map.end()) {
                sr.chunk_index = chunk_it->second;
            }

            results.push_back(sr);
        }

        // Ordenar por score descendente (mas relevante primero)
        std::sort(results.begin(), results.end(),
                  [](const VectorSearchResult& a, const VectorSearchResult& b) {
                      return a.score > b.score;
                  });

    } catch (const std::exception& e) {
        log_error("Error en busqueda vectorial: " + std::string(e.what()));
    }

    return results;
}

std::vector<VectorSearchResult> VectorStore::search_filtered(
    const std::vector<float>& query, int k, const std::string& source_filter) {

    // Buscar mas candidatos y filtrar despues
    auto all_results = search(query, k * 3);

    std::vector<VectorSearchResult> filtered;
    for (auto& r : all_results) {
        if (r.source_file.find(source_filter) != std::string::npos) {
            filtered.push_back(std::move(r));
            if (static_cast<int>(filtered.size()) >= k) break;
        }
    }

    return filtered;
}

void VectorStore::remove_by_source(const std::string& source_file) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!impl_->initialized) return;

    // hnswlib no soporta eliminacion directa de manera eficiente.
    // Marcamos los elementos para ignorarlos y re-construimos el indice.
    std::vector<size_t> to_remove;
    for (const auto& [id, source] : impl_->source_map) {
        if (source.find(source_file) != std::string::npos) {
            to_remove.push_back(id);
        }
    }

    // Marcar como eliminados (hnswlib soporta markDelete)
    for (size_t id : to_remove) {
        try {
            impl_->index->markDelete(id);
        } catch (...) {
            // Ignorar errores de eliminacion
        }
        impl_->content_map.erase(id);
        impl_->source_map.erase(id);
        impl_->chunk_index_map.erase(id);
    }

    if (!to_remove.empty()) {
        log_info("Eliminados " + std::to_string(to_remove.size()) +
                 " vectores de: " + source_file);
    }
}

void VectorStore::clear() {
    std::lock_guard<std::mutex> lock(mutex_);

    impl_->content_map.clear();
    impl_->source_map.clear();
    impl_->chunk_index_map.clear();

    // Re-crear indice vacio
    if (impl_->space) {
        impl_->index = std::make_unique<hnswlib::HierarchicalNSW<float>>(
            impl_->space.get(), impl_->max_elements, 16, 200);
    }
    impl_->next_id = 0;

    log_info("Vector store limpiado completamente");
}

size_t VectorStore::count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return impl_->content_map.size();
}

int VectorStore::dimension() const {
    return impl_->dimension;
}

bool VectorStore::is_initialized() const {
    return impl_->initialized;
}

std::string VectorStore::stats_json() const {
    std::lock_guard<std::mutex> lock(mutex_);
    json stats;
    stats["vector_count"] = impl_->content_map.size();
    stats["dimension"] = impl_->dimension;
    stats["max_elements"] = impl_->max_elements;
    stats["initialized"] = impl_->initialized;

    // Contar fuentes unicas
    std::unordered_set<std::string> unique_sources;
    for (const auto& [id, source] : impl_->source_map) {
        unique_sources.insert(source);
    }
    stats["unique_sources"] = unique_sources.size();

    return stats.dump();
}

} // namespace alfred
