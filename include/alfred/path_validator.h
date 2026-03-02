// ============================================================================
// path_validator.h - Validacion de seguridad de rutas
// ============================================================================
// Equivalente a: OldProject/backend/utils/security.py (parte de paths)
// Valida que las rutas de documentos del usuario sean seguras,
// rechazando path traversal, directorios del sistema, y patrones peligrosos.
// ============================================================================
#pragma once

#include <string>
#include <filesystem>
#include <tuple>

namespace alfred {

namespace fs = std::filesystem;

struct PathValidationResult {
    bool valid = false;
    std::string message;
    fs::path resolved_path;
};

// Validar ruta de directorio de documentos
PathValidationResult validate_document_path(const std::string& path_input);

// Verificar que una ruta esta dentro de un directorio permitido
bool is_path_within(const fs::path& path, const fs::path& allowed_base);

// Verificar patrones peligrosos en string de ruta
bool has_dangerous_patterns(const std::string& path_str);

} // namespace alfred
