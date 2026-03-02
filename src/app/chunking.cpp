// ============================================================================
// chunking.cpp - Fragmentacion inteligente de texto
// ============================================================================
#include "alfred/chunking.h"
#include "alfred/string_utils.h"
#include "alfred/logger.h"
#include "alfred/config.h"

#include <algorithm>
#include <filesystem>
#include <sstream>
#include <nlohmann/json.hpp>

namespace alfred {

using json = nlohmann::json;

ChunkingManager::ChunkingManager() {
    auto& cfg = get_config();

    // Estrategia para texto plano
    strategies_["text"] = {
        cfg.chunk_size_text, cfg.chunk_overlap_text,
        {"\n\n", "\n", ". ", " ", ""},
        "Texto plano (txt, csv, log)"
    };

    // Estrategia para codigo fuente
    strategies_["code"] = {
        cfg.chunk_size_code, cfg.chunk_overlap_code,
        {"\n\n", "\nclass ", "\ndef ", "\nfunc ", "\nfunction ",
         "\n\t", "\n", ". ", " ", ""},
        "Codigo fuente (py, js, cpp, md)"
    };

    // Estrategia para documentos estructurados
    strategies_["document"] = {
        cfg.chunk_size_document, cfg.chunk_overlap_document,
        {"\n\n\n", "\n\n", "\n", ". ", " ", ""},
        "Documentos (json, xml, html)"
    };

    // Mapeo extension -> estrategia
    // Texto
    for (const auto& ext : {".txt", ".log", ".csv", ".ini", ".cfg", ".conf"}) {
        extension_map_[ext] = "text";
    }
    // Codigo
    for (const auto& ext : {".py", ".js", ".ts", ".cpp", ".c", ".h", ".hpp",
                             ".java", ".rs", ".go", ".rb", ".php", ".sh",
                             ".bat", ".ps1", ".md", ".yaml", ".yml"}) {
        extension_map_[ext] = "code";
    }
    // Documentos
    for (const auto& ext : {".json", ".xml", ".html", ".htm"}) {
        extension_map_[ext] = "document";
    }
}

ChunkingManager& ChunkingManager::instance() {
    static ChunkingManager mgr;
    return mgr;
}

const ChunkingStrategy& ChunkingManager::get_strategy(const std::string& file_extension) const {
    std::string ext = to_lower(file_extension);
    auto it = extension_map_.find(ext);
    if (it != extension_map_.end()) {
        auto strat_it = strategies_.find(it->second);
        if (strat_it != strategies_.end()) {
            return strat_it->second;
        }
    }
    // Default: texto
    return strategies_.at("text");
}

std::vector<std::string> ChunkingManager::recursive_split(
    const std::string& text, const ChunkingStrategy& strategy) {

    std::vector<std::string> chunks;
    if (text.empty()) return chunks;

    int chunk_size = strategy.chunk_size;
    int overlap = strategy.chunk_overlap;

    // Intentar dividir por cada separador en orden
    for (const auto& separator : strategy.separators) {
        if (separator.empty()) {
            // Ultimo recurso: dividir por caracteres
            size_t pos = 0;
            while (pos < text.size()) {
                size_t end = std::min(pos + static_cast<size_t>(chunk_size), text.size());
                chunks.push_back(text.substr(pos, end - pos));
                if (end >= text.size()) break;
                pos = end - static_cast<size_t>(overlap);
            }
            return chunks;
        }

        // Dividir por separador
        auto parts = split(text, separator);
        if (parts.size() <= 1) continue; // Este separador no divide, probar siguiente

        // Combinar partes pequenas hasta llenar chunk_size
        std::string current;
        for (const auto& part : parts) {
            if (current.empty()) {
                current = part;
            } else if (static_cast<int>(current.size() + separator.size() + part.size()) <= chunk_size) {
                current += separator + part;
            } else {
                // Guardar chunk actual
                std::string trimmed = trim(current);
                if (!trimmed.empty()) {
                    chunks.push_back(trimmed);
                }

                // Overlap: tomar las ultimas palabras del chunk anterior
                if (overlap > 0 && static_cast<int>(current.size()) > overlap) {
                    std::string overlap_text = current.substr(current.size() - static_cast<size_t>(overlap));
                    current = overlap_text + separator + part;
                } else {
                    current = part;
                }
            }
        }

        // Agregar ultimo chunk
        std::string trimmed = trim(current);
        if (!trimmed.empty()) {
            chunks.push_back(trimmed);
        }

        if (!chunks.empty()) return chunks;
    }

    // Si ningun separador funciono, retornar el texto completo como un chunk
    if (chunks.empty() && !text.empty()) {
        chunks.push_back(trim(text));
    }

    return chunks;
}

std::vector<TextChunk> ChunkingManager::split_document(
    const std::string& content, const std::string& source_file,
    const std::string& doc_type) {

    std::vector<TextChunk> result;
    if (content.empty()) return result;

    // Determinar estrategia
    std::string type = doc_type;
    if (type.empty()) {
        std::filesystem::path path(source_file);
        type = "text";
        auto ext = to_lower(path.extension().string());
        auto it = extension_map_.find(ext);
        if (it != extension_map_.end()) type = it->second;
    }

    auto strat_it = strategies_.find(type);
    const ChunkingStrategy& strategy = (strat_it != strategies_.end())
        ? strat_it->second : strategies_.at("text");

    // Fragmentar
    auto raw_chunks = recursive_split(content, strategy);

    // Crear TextChunks con metadata
    int start_index = 0;
    for (int i = 0; i < static_cast<int>(raw_chunks.size()); ++i) {
        TextChunk chunk;
        chunk.content = raw_chunks[static_cast<size_t>(i)];
        chunk.start_index = start_index;
        chunk.chunk_index = i;
        chunk.source_file = source_file;
        chunk.doc_type = type;

        start_index += static_cast<int>(chunk.content.size());
        result.push_back(std::move(chunk));
    }

    return result;
}

std::vector<TextChunk> ChunkingManager::split_documents_adaptive(
    const std::vector<std::pair<std::string, std::string>>& docs) {

    std::vector<TextChunk> all_chunks;

    for (const auto& [content, filepath] : docs) {
        auto chunks = split_document(content, filepath);
        all_chunks.insert(all_chunks.end(),
                         std::make_move_iterator(chunks.begin()),
                         std::make_move_iterator(chunks.end()));
    }

    log_info("Fragmentacion adaptativa: " + std::to_string(docs.size()) +
             " documentos -> " + std::to_string(all_chunks.size()) + " fragmentos");

    return all_chunks;
}

std::string ChunkingManager::stats_json() const {
    json stats;
    for (const auto& [name, strategy] : strategies_) {
        stats[name] = {
            {"chunk_size", strategy.chunk_size},
            {"chunk_overlap", strategy.chunk_overlap},
            {"description", strategy.description},
            {"separators_count", strategy.separators.size()}
        };
    }
    stats["extensions_mapped"] = extension_map_.size();
    return stats.dump();
}

} // namespace alfred
