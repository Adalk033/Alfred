// ============================================================================
// paths.cpp - Resolucion de rutas del sistema
// ============================================================================
#include "alfred/paths.h"
#include "alfred/config.h"
#include <cstdlib>
#include <vector>

#ifdef _WIN32
#include <shlobj.h>
#include <windows.h>
#pragma comment(lib, "shell32.lib")
#endif

namespace alfred {

fs::path get_app_data_dir() {
#ifdef _WIN32
    // Windows: %APPDATA%/Alfred/
    wchar_t* appdata = nullptr;
    if (SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &appdata) == S_OK) {
        fs::path result = fs::path(appdata) / "Alfred";
        CoTaskMemFree(appdata);
        return result;
    }
    // Fallback
    const char* env = std::getenv("APPDATA");
    if (env) return fs::path(env) / "Alfred";
    return fs::path("./data");
#elif defined(__APPLE__)
    // macOS: ~/Library/Application Support/Alfred/
    const char* home = std::getenv("HOME");
    if (home) return fs::path(home) / "Library" / "Application Support" / "Alfred";
    return fs::path("./data");
#else
    // Linux: ~/.alfred/
    const char* home = std::getenv("HOME");
    if (home) return fs::path(home) / ".alfred";
    return fs::path("./data");
#endif
}

fs::path get_db_path() {
    return get_app_data_dir() / "db" / "alfred.db";
}

fs::path get_models_dir() {
    return get_app_data_dir() / "models";
}

fs::path get_docs_dir() {
    return get_app_data_dir() / "documents";
}

fs::path get_logs_dir() {
    return get_app_data_dir() / "logs";
}

fs::path get_vector_store_dir() {
    return get_app_data_dir() / "vector_store";
}

fs::path get_encryption_key_path() {
    return get_app_data_dir() / "data" / "secret.key";
}

void init_paths() {
    // Crear todos los directorios necesarios
    const std::vector<fs::path> dirs = {
        get_app_data_dir(),
        get_db_path().parent_path(),
        get_models_dir(),
        get_docs_dir(),
        get_logs_dir(),
        get_vector_store_dir(),
        get_encryption_key_path().parent_path(),
    };

    for (const auto& dir : dirs) {
        if (!fs::exists(dir)) {
            std::error_code ec;
            fs::create_directories(dir, ec);
        }
    }

    // Actualizar config global con rutas resueltas
    auto& cfg = get_config();
    cfg.data_dir   = get_app_data_dir().string();
    cfg.db_path    = get_db_path().string();
    cfg.models_dir = get_models_dir().string();
    cfg.docs_dir   = get_docs_dir().string();
    cfg.logs_dir   = get_logs_dir().string();
    cfg.chroma_dir = get_vector_store_dir().string();
}

} // namespace alfred
