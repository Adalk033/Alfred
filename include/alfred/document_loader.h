// ============================================================================
// document_loader.h - Carga de documentos del usuario
// ============================================================================
// Equivalente a: OldProject/backend/core/document_loader.py
// Carga archivos de texto desde directorios configurados por el usuario.
// Detecta cambios via SHA-256 hash del contenido.
// Soporta: .txt, .md, .csv, .json, .xml, .html, .log
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <optional>
#include <unordered_map>
#include <filesystem>

namespace alfred {

namespace fs = std::filesystem;

struct DocumentMetadata {
    std::string file_path;
    std::string file_hash;     // SHA-256
    size_t file_size = 0;
    std::string last_modified;
    std::string loaded_at;
    std::string doc_type;      // "text", "code", "document"
    bool is_changed = false;
};

struct LoadedDocument {
    std::string content;
    DocumentMetadata metadata;
};

struct ScanResult {
    std::vector<std::string> new_files;
    std::vector<std::string> modified_files;
    std::vector<std::string> deleted_files;
};

class DocumentLoader {
public:
    DocumentLoader() = default;

    // Cargar un solo documento
    // existing_hash: hash previo para detectar cambios (vacio si es nuevo)
    std::optional<LoadedDocument> load_single(const std::string& file_path,
                                               const std::string& existing_hash = "");

    // Cargar todos los documentos de un directorio
    std::pair<std::vector<LoadedDocument>,
              std::unordered_map<std::string, DocumentMetadata>>
    load_directory(const std::string& dir_path,
                   const std::unordered_map<std::string, std::string>& existing_hashes = {});

    // Escanear directorio para detectar cambios sin cargar contenido
    ScanResult scan_for_changes(const std::string& dir_path,
                                 const std::unordered_map<std::string, std::string>& existing_hashes);

    // Extensiones soportadas
    static bool is_supported_extension(const std::string& ext);

    // Determinar tipo de documento por extension
    static std::string get_doc_type(const std::string& ext);

private:
    // Leer contenido del archivo
    std::string read_file_content(const std::string& file_path);

    // Extensiones soportadas para carga
    static const std::vector<std::string> SUPPORTED_EXTENSIONS;
};

} // namespace alfred
