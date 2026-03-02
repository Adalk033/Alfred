// ============================================================================
// paths.h - Resolucion de rutas del sistema
// ============================================================================
// Equivalente a: OldProject/backend/utils/paths.py
// Resuelve rutas para datos, DB, modelos, logs segun el SO.
// Windows: %APPDATA%/Alfred/  Linux/Mac: ~/.alfred/
// ============================================================================
#pragma once

#include <string>
#include <filesystem>

namespace alfred {

namespace fs = std::filesystem;

// Obtener directorio base de datos de la aplicacion
fs::path get_app_data_dir();

// Rutas especificas
fs::path get_db_path();
fs::path get_models_dir();
fs::path get_docs_dir();
fs::path get_logs_dir();
fs::path get_encryption_key_path();

// Inicializar todas las rutas (crear directorios si no existen)
void init_paths();

} // namespace alfred
