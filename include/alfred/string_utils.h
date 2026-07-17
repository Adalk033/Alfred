// ============================================================================
// string_utils.h - Utilidades de manipulacion de strings
// ============================================================================
// Funciones auxiliares para procesamiento y normalizacion de texto.
// ============================================================================
#pragma once

#include <string>
#include <vector>

namespace alfred {

// Trim whitespace
std::string trim(const std::string& s);
std::string to_lower(const std::string& s);

// Reemplazo in-place de todas las apariciones de `from` por `to` en `str`.
void replace_all(std::string& str, const std::string& from, const std::string& to);

// Split string por delimitador
std::vector<std::string> split(const std::string& s, char delimiter);
std::vector<std::string> split(const std::string& s, const std::string& delimiter);

// Unir vector de strings
std::string join(const std::vector<std::string>& parts, const std::string& separator);

// SHA-256 de un string
std::string sha256_string(const std::string& input);

// Generar UUID v4
std::string generate_uuid();

// Truncar texto a max_length caracteres
std::string truncate(const std::string& text, size_t max_length, const std::string& suffix = "...");

// Extrae la respuesta final visible eliminando bloques internos de pensamiento.
// Soporta variantes de tags como <|channel|>thought ... <|channel|>.
std::string extract_final_response_text(const std::string& text);

} // namespace alfred
