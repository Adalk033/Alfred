// ============================================================================
// chunking.h - Fragmentacion inteligente de texto
// ============================================================================
// Equivalente a: OldProject/backend/core/chunking_manager.py
// Divide documentos en fragmentos con overlap segun el tipo:
//   text:     600 chars, 100 overlap (archivos de texto)
//   code:     500 chars, 100 overlap (codigo fuente, markdown)
//   document: 800 chars, 150 overlap (PDFs, documentos largos)
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_map>

namespace alfred {

struct TextChunk {
    std::string content;
    int start_index = 0;        // Posicion en el documento original
    int chunk_index = 0;        // Indice del fragmento
    std::string source_file;    // Archivo de origen
    std::string doc_type;       // Tipo de documento
};

struct ChunkingStrategy {
    int chunk_size = 600;
    int chunk_overlap = 100;
    std::vector<std::string> separators;
    std::string description;
};

class ChunkingManager {
public:
    static ChunkingManager& instance();

    // Fragmentar un documento segun su tipo
    std::vector<TextChunk> split_document(const std::string& content,
                                           const std::string& source_file,
                                           const std::string& doc_type = "");

    // Fragmentar multiples documentos adaptativamente
    std::vector<TextChunk> split_documents_adaptive(
        const std::vector<std::pair<std::string, std::string>>& docs);  // (content, filepath)

    // Obtener estrategia por extension de archivo
    const ChunkingStrategy& get_strategy(const std::string& file_extension) const;

    // Estadisticas
    std::string stats_json() const;

private:
    ChunkingManager();

    // Estrategias predefinidas
    std::unordered_map<std::string, ChunkingStrategy> strategies_;

    // Mapa extension -> nombre de estrategia
    std::unordered_map<std::string, std::string> extension_map_;

    // Fragmentar con separadores recursivos
    std::vector<std::string> recursive_split(const std::string& text,
                                              const ChunkingStrategy& strategy);
};

} // namespace alfred
