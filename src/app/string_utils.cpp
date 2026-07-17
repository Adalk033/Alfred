// ============================================================================
// string_utils.cpp - Utilidades de manipulacion de strings
// ============================================================================
#include "alfred/string_utils.h"
#include <algorithm>
#include <cctype>
#include <sstream>
#include <random>
#include <iomanip>
#include <functional>

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
