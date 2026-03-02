// ============================================================================
// path_validator.cpp - Validacion de seguridad de rutas
// ============================================================================
#include "alfred/path_validator.h"

#include <regex>
#include <algorithm>

namespace alfred {

// Directorios prohibidos por plataforma
#ifdef _WIN32
static const std::vector<std::string> FORBIDDEN_PATHS = {
    "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
    "C:\\ProgramData", "C:\\System Volume Information",
    "C:\\$Recycle.Bin", "C:\\Recovery"
};
#else
static const std::vector<std::string> FORBIDDEN_PATHS = {
    "/bin", "/sbin", "/usr/bin", "/usr/sbin", "/boot",
    "/dev", "/proc", "/sys", "/etc", "/var/run", "/root"
};
#endif

// Patrones peligrosos en rutas
static const std::vector<std::string> DANGEROUS_PATTERNS = {
    "..", "|", ">", "<", "&", ";", "`", "$(",
    "\\0", "%00", "\n", "\r"
};

bool has_dangerous_patterns(const std::string& path_str) {
    for (const auto& pattern : DANGEROUS_PATTERNS) {
        if (path_str.find(pattern) != std::string::npos) {
            return true;
        }
    }
    return false;
}

bool is_path_within(const fs::path& path, const fs::path& allowed_base) {
    std::error_code ec;
    auto canonical_path = fs::canonical(path, ec);
    if (ec) return false;

    auto canonical_base = fs::canonical(allowed_base, ec);
    if (ec) return false;

    auto path_str = canonical_path.string();
    auto base_str = canonical_base.string();

    return path_str.find(base_str) == 0;
}

PathValidationResult validate_document_path(const std::string& path_input) {
    PathValidationResult result;

    // Verificar que no este vacio
    if (path_input.empty()) {
        result.message = "La ruta no puede estar vacia";
        return result;
    }

    // Verificar patrones peligrosos
    if (has_dangerous_patterns(path_input)) {
        result.message = "La ruta contiene patrones peligrosos";
        return result;
    }

    // Resolver ruta
    std::error_code ec;
    fs::path resolved = fs::canonical(path_input, ec);
    if (ec) {
        // Si canonical falla, intentar con absolute
        resolved = fs::absolute(path_input);
        if (!fs::exists(resolved)) {
            result.message = "La ruta no existe: " + path_input;
            return result;
        }
    }

    // Verificar que existe
    if (!fs::exists(resolved)) {
        result.message = "La ruta no existe: " + resolved.string();
        return result;
    }

    // Verificar que es directorio
    if (!fs::is_directory(resolved)) {
        result.message = "La ruta no es un directorio: " + resolved.string();
        return result;
    }

    // Verificar contra directorios prohibidos
    std::string resolved_str = resolved.string();
    for (const auto& forbidden : FORBIDDEN_PATHS) {
        // Comparacion case-insensitive en Windows
        std::string resolved_lower = resolved_str;
        std::string forbidden_lower = forbidden;
#ifdef _WIN32
        std::transform(resolved_lower.begin(), resolved_lower.end(),
                       resolved_lower.begin(), ::tolower);
        std::transform(forbidden_lower.begin(), forbidden_lower.end(),
                       forbidden_lower.begin(), ::tolower);
#endif
        if (resolved_lower.find(forbidden_lower) == 0) {
            result.message = "Ruta prohibida: directorio del sistema";
            return result;
        }
    }

    // Verificar permisos de lectura
    auto perms = fs::status(resolved).permissions();
    if ((perms & fs::perms::owner_read) == fs::perms::none) {
        result.message = "Sin permisos de lectura en: " + resolved.string();
        return result;
    }

    result.valid = true;
    result.message = "Ruta valida";
    result.resolved_path = resolved;
    return result;
}

} // namespace alfred
