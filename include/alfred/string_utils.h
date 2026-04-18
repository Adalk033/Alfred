// ============================================================================
// string_utils.h - Utilidades de manipulacion de strings
// ============================================================================
// Funciones auxiliares para procesamiento de texto, normalizacion,
// extraccion de keywords, y similitud para el sistema RAG.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_set>

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

// Extraer keywords (filtra stopwords en espanol, min_length caracteres)
std::vector<std::string> extract_keywords(const std::string& text, int min_length = 3);

// Similitud Jaccard entre dos conjuntos de keywords
float jaccard_similarity(const std::vector<std::string>& a, const std::vector<std::string>& b);

// SHA-256 de un string
std::string sha256_string(const std::string& input);

// SHA-256 de un archivo
std::string sha256_file(const std::string& file_path);

// Generar UUID v4
std::string generate_uuid();

// Stopwords en espanol
const std::unordered_set<std::string>& get_spanish_stopwords();

// Verificar si contiene patron de datos personales (RFC, CURP, NSS)
bool contains_personal_data_patterns(const std::string& text);

// Extraer datos personales del texto
struct PersonalData {
    std::string rfc;
    std::string curp;
    std::string nss;
};
PersonalData extract_personal_data(const std::string& text);

// Truncar texto a max_length caracteres
std::string truncate(const std::string& text, size_t max_length, const std::string& suffix = "...");

} // namespace alfred
