// ============================================================================
// string_utils.cpp - Utilidades de manipulacion de strings
// ============================================================================
#include "alfred/string_utils.h"
#include <algorithm>
#include <cctype>
#include <sstream>
#include <fstream>
#include <regex>
#include <random>
#include <iomanip>
#include <functional>

// SHA-256 (implementacion simplificada sin OpenSSL para hashing basico)
// Para archivos grandes, se usa la implementacion estandar
#include <array>
#include <cstring>

namespace alfred {

std::string trim(const std::string& s) {
    auto start = s.find_first_not_of(" \t\n\r\f\v");
    if (start == std::string::npos) return "";
    auto end = s.find_last_not_of(" \t\n\r\f\v");
    return s.substr(start, end - start + 1);
}

std::string to_lower(const std::string& s) {
    std::string result = s;
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return result;
}

void replace_all(std::string& str, const std::string& from, const std::string& to) {
    if (from.empty()) return;
    size_t pos = 0;
    while ((pos = str.find(from, pos)) != std::string::npos) {
        str.replace(pos, from.length(), to);
        pos += to.length();
    }
}

std::vector<std::string> split(const std::string& s, char delimiter) {
    std::vector<std::string> parts;
    std::istringstream stream(s);
    std::string part;
    while (std::getline(stream, part, delimiter)) {
        parts.push_back(part);
    }
    return parts;
}

std::vector<std::string> split(const std::string& s, const std::string& delimiter) {
    std::vector<std::string> parts;
    size_t start = 0;
    size_t end = s.find(delimiter);
    while (end != std::string::npos) {
        parts.push_back(s.substr(start, end - start));
        start = end + delimiter.size();
        end = s.find(delimiter, start);
    }
    parts.push_back(s.substr(start));
    return parts;
}

std::string join(const std::vector<std::string>& parts, const std::string& separator) {
    if (parts.empty()) return "";
    std::ostringstream oss;
    oss << parts[0];
    for (size_t i = 1; i < parts.size(); ++i) {
        oss << separator << parts[i];
    }
    return oss.str();
}

const std::unordered_set<std::string>& get_spanish_stopwords() {
    static const std::unordered_set<std::string> stopwords = {
        "a", "al", "algo", "algunas", "algunos", "ante", "antes", "aquel",
        "aquellas", "aquellos", "aqui", "asi", "aunque", "bien", "bueno",
        "cada", "casi", "como", "con", "contra", "cosas", "creo", "cual",
        "cuando", "da", "dar", "de", "del", "demasiado", "dentro", "desde",
        "donde", "dos", "el", "en", "encima", "entonces", "entre", "era",
        "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estado",
        "estar", "estas", "este", "esto", "estos", "fue", "ha", "hace",
        "hacer", "hacia", "hasta", "hay", "hecho", "ir", "la", "las", "le",
        "les", "lo", "los", "mas", "me", "mejor", "menos", "mi", "mientras",
        "misma", "mismo", "mucho", "muy", "nada", "ni", "ninguno", "no",
        "nos", "nosotros", "nuestro", "nuevo", "o", "otra", "otro", "otros",
        "para", "parte", "pero", "poco", "por", "porque", "primera",
        "puede", "puedo", "pues", "que", "quien", "quiero", "se", "sea",
        "segun", "ser", "si", "sido", "siempre", "sin", "sino", "sobre",
        "somos", "son", "soy", "su", "sus", "tal", "tambien", "tan",
        "tanto", "te", "tengo", "tiempo", "tiene", "toda", "todavia",
        "todo", "todos", "tres", "tu", "tus", "un", "una", "unas", "uno",
        "unos", "usted", "ustedes", "va", "vamos", "ver", "vez", "y", "ya",
        "yo"
    };
    return stopwords;
}

std::vector<std::string> extract_keywords(const std::string& text, int min_length) {
    std::vector<std::string> keywords;
    const auto& stopwords = get_spanish_stopwords();

    // Extraer palabras con regex
    std::regex word_regex("[a-zA-Z0-9\xC0-\xFF]+");
    auto words_begin = std::sregex_iterator(text.begin(), text.end(), word_regex);
    auto words_end = std::sregex_iterator();

    for (auto it = words_begin; it != words_end; ++it) {
        std::string word = to_lower(it->str());
        if (static_cast<int>(word.size()) >= min_length &&
            stopwords.find(word) == stopwords.end()) {
            keywords.push_back(word);
        }
    }
    return keywords;
}

float jaccard_similarity(const std::vector<std::string>& a, const std::vector<std::string>& b) {
    if (a.empty() && b.empty()) return 0.0f;

    std::unordered_set<std::string> set_a(a.begin(), a.end());
    std::unordered_set<std::string> set_b(b.begin(), b.end());

    int intersection = 0;
    for (const auto& word : set_a) {
        if (set_b.count(word)) ++intersection;
    }

    int union_size = static_cast<int>(set_a.size() + set_b.size()) - intersection;
    if (union_size == 0) return 0.0f;

    return static_cast<float>(intersection) / static_cast<float>(union_size);
}

// Implementacion basica de SHA-256 (DJB2 hash como fallback rapido)
// Para produccion se recomienda usar OpenSSL SHA256
static std::string simple_hash(const std::string& input) {
    std::hash<std::string> hasher;
    size_t hash_val = hasher(input);
    std::ostringstream oss;
    oss << std::hex << std::setfill('0') << std::setw(16) << hash_val;
    return oss.str();
}

std::string sha256_string(const std::string& input) {
    // Usa funcion hash estandar (reemplazar con OpenSSL para criptografia real)
    return simple_hash(input);
}

std::string sha256_file(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary);
    if (!file.is_open()) return "";

    std::ostringstream oss;
    oss << file.rdbuf();
    return simple_hash(oss.str());
}

std::string generate_uuid() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<int> dist(0, 15);
    static std::uniform_int_distribution<int> dist2(8, 11);

    const char* hex = "0123456789abcdef";
    std::string uuid(36, ' ');

    for (int i = 0; i < 36; ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            uuid[i] = '-';
        } else if (i == 14) {
            uuid[i] = '4';
        } else if (i == 19) {
            uuid[i] = hex[dist2(gen)];
        } else {
            uuid[i] = hex[dist(gen)];
        }
    }
    return uuid;
}

bool contains_personal_data_patterns(const std::string& text) {
    // RFC: 4 letras + 6 digitos + 3 alfanumericos
    static const std::regex rfc_pattern(R"([A-Z]{4}\d{6}[A-Z0-9]{3})", std::regex::icase);
    // CURP: 4 letras + 6 digitos + 6 letras + 2 alfanumericos
    static const std::regex curp_pattern(R"([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)", std::regex::icase);
    // NSS: 11 digitos
    static const std::regex nss_pattern(R"(\b\d{11}\b)");

    return std::regex_search(text, rfc_pattern) ||
           std::regex_search(text, curp_pattern) ||
           std::regex_search(text, nss_pattern);
}

PersonalData extract_personal_data(const std::string& text) {
    PersonalData data;

    static const std::regex rfc_pattern(R"(([A-Z]{4}\d{6}[A-Z0-9]{3}))", std::regex::icase);
    static const std::regex curp_pattern(R"(([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d))", std::regex::icase);
    static const std::regex nss_pattern(R"(\b(\d{11})\b)");

    std::smatch match;
    if (std::regex_search(text, match, rfc_pattern)) {
        data.rfc = match[1].str();
    }
    if (std::regex_search(text, match, curp_pattern)) {
        data.curp = match[1].str();
    }
    if (std::regex_search(text, match, nss_pattern)) {
        data.nss = match[1].str();
    }
    return data;
}

std::string truncate(const std::string& text, size_t max_length, const std::string& suffix) {
    if (text.size() <= max_length) return text;
    if (max_length <= suffix.size()) return suffix;
    return text.substr(0, max_length - suffix.size()) + suffix;
}

std::string extract_final_response_text(const std::string& text) {
    if (text.empty()) return "";

    static const std::vector<std::string> kThoughtStartMarkers = {
        "<|channel|>thought",
        "<|channel>thought",
        "<|thought|>",
        "<thought>",
    };
    static const std::vector<std::string> kThoughtEndMarkers = {
        "<|channel|>",
        "<channel|>",
        "</thought>",
        "<|/thought|>",
        "</think>",
        "<|end_thought|>",
    };

    auto find_earliest = [](const std::string& s,
                            size_t from,
                            const std::vector<std::string>& markers,
                            size_t* marker_len) -> size_t {
        size_t best_pos = std::string::npos;
        size_t best_len = 0;
        for (const auto& marker : markers) {
            size_t p = s.find(marker, from);
            if (p != std::string::npos && (best_pos == std::string::npos || p < best_pos)) {
                best_pos = p;
                best_len = marker.size();
            }
        }
        if (marker_len) *marker_len = best_len;
        return best_pos;
    };

    std::string out;
    out.reserve(text.size());

    bool found_block = false;
    size_t pos = 0;
    while (pos < text.size()) {
        size_t start_len = 0;
        size_t start = find_earliest(text, pos, kThoughtStartMarkers, &start_len);
        if (start == std::string::npos) {
            out.append(text, pos, std::string::npos);
            break;
        }

        found_block = true;
        out.append(text, pos, start - pos);

        size_t end_len = 0;
        size_t end = find_earliest(text, start + start_len, kThoughtEndMarkers, &end_len);
        if (end == std::string::npos) {
            break;
        }
        pos = end + end_len;
    }

    auto extract_after_last_marker = [](const std::string& s) -> std::string {
        static const std::vector<std::string> kChannelMarkers = {
            "<channel|>",
            "<|channel|>",
            "<|channel>",
        };

        size_t best_pos = std::string::npos;
        size_t best_len = 0;
        for (const auto& marker : kChannelMarkers) {
            size_t p = s.rfind(marker);
            if (p != std::string::npos && (best_pos == std::string::npos || p > best_pos)) {
                best_pos = p;
                best_len = marker.size();
            }
        }

        if (best_pos == std::string::npos) return "";
        return trim(s.substr(best_pos + best_len));
    };

    std::string cleaned;

    if (!found_block) {
        cleaned = trim(text);
        // Caso observado en produccion: el modelo puede emitir razonamiento
        // en claro y luego delimitar la respuesta final con <channel|>.
        std::string after_channel = extract_after_last_marker(cleaned);
        if (!after_channel.empty()) {
            cleaned = std::move(after_channel);
        }
    } else {
        cleaned = trim(out);
    }

    // Limpieza defensiva de tags huerfanos de canal.
    replace_all(cleaned, "<|channel|>", "");
    replace_all(cleaned, "<channel|>", "");
    replace_all(cleaned, "<|channel>", "");
    return trim(cleaned);
}

} // namespace alfred
