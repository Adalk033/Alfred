// ============================================================================
// document_loader.cpp - Carga de documentos del usuario
// ============================================================================
#include "alfred/document_loader.h"
#include "alfred/string_utils.h"
#include "alfred/config.h"
#include "alfred/logger.h"

#include <fstream>
#include <sstream>
#include <algorithm>
#include <chrono>
#include <iomanip>

namespace alfred {

const std::vector<std::string> DocumentLoader::SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm",
    ".log", ".yaml", ".yml", ".ini", ".cfg", ".conf",
    ".py", ".js", ".ts", ".cpp", ".c", ".h", ".hpp",
    ".java", ".rs", ".go", ".rb", ".php", ".sh", ".bat", ".ps1"
};

bool DocumentLoader::is_supported_extension(const std::string& ext) {
    std::string lower_ext = to_lower(ext);
    return std::find(SUPPORTED_EXTENSIONS.begin(), SUPPORTED_EXTENSIONS.end(), lower_ext)
           != SUPPORTED_EXTENSIONS.end();
}

std::string DocumentLoader::get_doc_type(const std::string& ext) {
    std::string lower_ext = to_lower(ext);

    // Texto plano
    if (lower_ext == ".txt" || lower_ext == ".log" ||
        lower_ext == ".csv" || lower_ext == ".ini" ||
        lower_ext == ".cfg" || lower_ext == ".conf") {
        return "text";
    }

    // Codigo fuente
    if (lower_ext == ".py" || lower_ext == ".js" || lower_ext == ".ts" ||
        lower_ext == ".cpp" || lower_ext == ".c" || lower_ext == ".h" ||
        lower_ext == ".hpp" || lower_ext == ".java" || lower_ext == ".rs" ||
        lower_ext == ".go" || lower_ext == ".rb" || lower_ext == ".php" ||
        lower_ext == ".sh" || lower_ext == ".bat" || lower_ext == ".ps1" ||
        lower_ext == ".md" || lower_ext == ".yaml" || lower_ext == ".yml") {
        return "code";
    }

    // Documentos estructurados
    if (lower_ext == ".json" || lower_ext == ".xml" ||
        lower_ext == ".html" || lower_ext == ".htm") {
        return "document";
    }

    return "text"; // Default
}

std::string DocumentLoader::read_file_content(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary);
    if (!file.is_open()) {
        log_warn("No se pudo abrir archivo: " + file_path);
        return "";
    }

    std::ostringstream oss;
    oss << file.rdbuf();
    return oss.str();
}

std::optional<LoadedDocument> DocumentLoader::load_single(
    const std::string& file_path, const std::string& existing_hash) {

    fs::path path(file_path);

    // Verificar que existe y es archivo
    if (!fs::exists(path) || !fs::is_regular_file(path)) {
        return std::nullopt;
    }

    // Verificar extension soportada
    std::string ext = path.extension().string();
    if (!is_supported_extension(ext)) {
        return std::nullopt;
    }

    // Calcular hash
    std::string hash = sha256_file(file_path);

    // Si el hash no cambio, saltar
    if (!existing_hash.empty() && hash == existing_hash) {
        return std::nullopt; // Sin cambios
    }

    // Leer contenido
    std::string content = read_file_content(file_path);
    if (content.empty()) {
        return std::nullopt;
    }

    // Obtener metadata del archivo
    auto file_time = fs::last_write_time(path);
    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
        file_time - fs::file_time_type::clock::now() + std::chrono::system_clock::now()
    );
    auto time_t_val = std::chrono::system_clock::to_time_t(sctp);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &time_t_val);
#else
    localtime_r(&time_t_val, &tm);
#endif
    std::ostringstream time_oss;
    time_oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");

    LoadedDocument doc;
    doc.content = std::move(content);
    doc.metadata.file_path = file_path;
    doc.metadata.file_hash = hash;
    doc.metadata.file_size = fs::file_size(path);
    doc.metadata.last_modified = time_oss.str();
    doc.metadata.loaded_at = get_current_datetime();
    doc.metadata.doc_type = get_doc_type(ext);
    doc.metadata.is_changed = !existing_hash.empty();

    return doc;
}

std::pair<std::vector<LoadedDocument>,
          std::unordered_map<std::string, DocumentMetadata>>
DocumentLoader::load_directory(const std::string& dir_path,
                               const std::unordered_map<std::string, std::string>& existing_hashes) {
    std::vector<LoadedDocument> documents;
    std::unordered_map<std::string, DocumentMetadata> metadata_map;

    if (!fs::exists(dir_path) || !fs::is_directory(dir_path)) {
        log_warn("Directorio no existe: " + dir_path);
        return {documents, metadata_map};
    }

    int loaded = 0;
    int skipped = 0;
    int errors = 0;

    for (const auto& entry : fs::recursive_directory_iterator(dir_path)) {
        if (!entry.is_regular_file()) continue;

        std::string file_path = entry.path().string();
        std::string ext = entry.path().extension().string();

        if (!is_supported_extension(ext)) continue;

        // Buscar hash existente
        std::string existing_hash;
        auto it = existing_hashes.find(file_path);
        if (it != existing_hashes.end()) {
            existing_hash = it->second;
        }

        auto doc = load_single(file_path, existing_hash);
        if (doc) {
            metadata_map[file_path] = doc->metadata;
            documents.push_back(std::move(*doc));
            ++loaded;
        } else if (!existing_hash.empty()) {
            ++skipped; // Sin cambios
        } else {
            ++errors;
        }
    }

    log_info("Documentos cargados: " + std::to_string(loaded) +
             " nuevos/modificados, " + std::to_string(skipped) +
             " sin cambios, " + std::to_string(errors) + " errores");

    return {documents, metadata_map};
}

ScanResult DocumentLoader::scan_for_changes(
    const std::string& dir_path,
    const std::unordered_map<std::string, std::string>& existing_hashes) {

    ScanResult result;
    std::unordered_set<std::string> found_files;

    if (!fs::exists(dir_path) || !fs::is_directory(dir_path)) {
        return result;
    }

    for (const auto& entry : fs::recursive_directory_iterator(dir_path)) {
        if (!entry.is_regular_file()) continue;

        std::string file_path = entry.path().string();
        std::string ext = entry.path().extension().string();

        if (!is_supported_extension(ext)) continue;

        found_files.insert(file_path);

        auto it = existing_hashes.find(file_path);
        if (it == existing_hashes.end()) {
            result.new_files.push_back(file_path);
        } else {
            std::string current_hash = sha256_file(file_path);
            if (current_hash != it->second) {
                result.modified_files.push_back(file_path);
            }
        }
    }

    // Detectar archivos eliminados
    for (const auto& [path, hash] : existing_hashes) {
        if (found_files.find(path) == found_files.end()) {
            result.deleted_files.push_back(path);
        }
    }

    return result;
}

} // namespace alfred
