// ============================================================================
// tool_protocol.cpp - Implementacion del parser de tool_calls y helpers de prompt
// ============================================================================
#include "alfred/tool_protocol.h"

#include <cstring>

namespace alfred {

const char* const TOOL_CALL_OPEN  = "<tool_call>";
const char* const TOOL_CALL_CLOSE = "</tool_call>";

namespace {

// Devuelve la longitud del sufijo mas largo de `s` que es prefijo de `marker`.
// Garantiza que el resultado es < strlen(marker): si el marker completo aparece
// como sufijo eso ya se maneja como match completo en otra rama.
size_t longest_suffix_prefix_of(const std::string& s, const char* marker) {
    const size_t mlen = std::strlen(marker);
    const size_t max_k = std::min(s.size(), mlen - 1);
    for (size_t k = max_k; k > 0; --k) {
        if (std::memcmp(s.data() + s.size() - k, marker, k) == 0) {
            return k;
        }
    }
    return 0;
}

} // namespace

ToolCallParser::ToolCallParser() = default;

void ToolCallParser::feed(const std::string& chunk,
                          const TextEmit&    on_text,
                          const ToolCallEmit& on_tool_call) {
    buffer_.append(chunk);
    drain(on_text, on_tool_call, /*final_pass=*/false);
}

void ToolCallParser::flush(const TextEmit&     on_text,
                           const ToolCallEmit& on_tool_call) {
    drain(on_text, on_tool_call, /*final_pass=*/true);

    // Si nos quedamos dentro de una tool_call sin cerrar, no podemos parsear
    // JSON. Volcamos lo acumulado como texto literal con el marcador de
    // apertura para no perderlo. El cliente vera el texto crudo y sabra que
    // el modelo no cerro la tag.
    if (state_ == State::INSIDE) {
        std::string fallback = TOOL_CALL_OPEN;
        fallback.append(tool_content_);
        if (on_text) on_text(fallback);
        tool_content_.clear();
        state_ = State::TEXT;
    }

    // Cualquier residuo de buffer_ en TEXT se emite literal en final_pass,
    // pero drain() ya lo hace. Aqui solo defensivo:
    if (!buffer_.empty() && state_ == State::TEXT) {
        if (on_text) on_text(buffer_);
        buffer_.clear();
    }
}

void ToolCallParser::drain(const TextEmit& on_text,
                            const ToolCallEmit& on_tool_call,
                            bool final_pass) {
    while (true) {
        if (state_ == State::TEXT) {
            // Buscar marcador de apertura completo.
            size_t open_pos = buffer_.find(TOOL_CALL_OPEN);
            if (open_pos != std::string::npos) {
                if (open_pos > 0 && on_text) {
                    on_text(buffer_.substr(0, open_pos));
                }
                buffer_.erase(0, open_pos + std::strlen(TOOL_CALL_OPEN));
                state_ = State::INSIDE;
                tool_content_.clear();
                continue; // reprocesar restante en estado INSIDE
            }

            // Sin marcador completo. En streaming retenemos el sufijo que
            // podria ser inicio del marcador. En final_pass volcamos todo.
            size_t hold = final_pass ? 0
                                     : longest_suffix_prefix_of(buffer_, TOOL_CALL_OPEN);
            if (buffer_.size() > hold) {
                if (on_text) on_text(buffer_.substr(0, buffer_.size() - hold));
                buffer_.erase(0, buffer_.size() - hold);
            }
            return; // no hay mas progreso posible
        }

        // state_ == INSIDE: acumular hasta cierre.
        size_t close_pos = buffer_.find(TOOL_CALL_CLOSE);
        if (close_pos != std::string::npos) {
            tool_content_.append(buffer_.substr(0, close_pos));
            buffer_.erase(0, close_pos + std::strlen(TOOL_CALL_CLOSE));

            emit_tool_call(on_text, on_tool_call);
            tool_content_.clear();
            state_ = State::TEXT;
            continue;
        }

        // Sin cierre: en streaming acumulamos lo seguro y retenemos posible
        // prefijo del marcador de cierre. En final_pass nos rendimos y
        // dejamos que flush() vuelque el bloque completo como texto.
        if (final_pass) return;

        size_t hold = longest_suffix_prefix_of(buffer_, TOOL_CALL_CLOSE);
        if (buffer_.size() > hold) {
            tool_content_.append(buffer_.data(), buffer_.size() - hold);
            buffer_.erase(0, buffer_.size() - hold);
        }
        return;
    }
}

bool ToolCallParser::emit_tool_call(const TextEmit& on_text,
                                     const ToolCallEmit& on_tool_call) {
    json parsed;
    try {
        parsed = json::parse(tool_content_);
    } catch (const json::parse_error&) {
        // JSON invalido. Volcar el bloque entero como texto para no
        // engullirlo silenciosamente.
        if (on_text) {
            std::string fallback = TOOL_CALL_OPEN;
            fallback.append(tool_content_);
            fallback.append(TOOL_CALL_CLOSE);
            on_text(fallback);
        }
        return false;
    }

    if (!parsed.is_object()) {
        if (on_text) {
            std::string fallback = TOOL_CALL_OPEN;
            fallback.append(tool_content_);
            fallback.append(TOOL_CALL_CLOSE);
            on_text(fallback);
        }
        return false;
    }

    ToolCall tc;
    tc.id        = parsed.value("id", std::string{});
    tc.name      = parsed.value("name", std::string{});
    if (parsed.contains("arguments")) {
        tc.arguments = parsed["arguments"];
    } else {
        tc.arguments = json::object();
    }

    // El name es obligatorio para que el cliente sepa que invocar.
    if (tc.name.empty()) {
        if (on_text) {
            std::string fallback = TOOL_CALL_OPEN;
            fallback.append(tool_content_);
            fallback.append(TOOL_CALL_CLOSE);
            on_text(fallback);
        }
        return false;
    }

    if (on_tool_call) on_tool_call(tc);
    saw_tool_call_ = true;
    return true;
}

// ----------------------------------------------------------------------------
// Helpers de prompt
// ----------------------------------------------------------------------------

std::string format_tools_section(const std::vector<ToolSpec>& tools) {
    if (tools.empty()) return "";

    std::string out;
    out += "\n\nTienes acceso a las siguientes herramientas para responder al usuario:\n\n";
    out += "<tools>\n";
    for (const auto& t : tools) {
        json j;
        j["name"]         = t.name;
        j["description"]  = t.description;
        j["input_schema"] = t.input_schema.is_null() ? json::object() : t.input_schema;
        out += j.dump();
        out += "\n";
    }
    out += "</tools>\n\n";
    out += "Cuando necesites invocar una herramienta responde EXACTAMENTE con un bloque:\n";
    out += "<tool_call>{\"id\":\"call_<n>\",\"name\":\"<tool>\",\"arguments\":{...}}</tool_call>\n";
    out += "Despues de cada bloque <tool_call> espera el resultado antes de continuar.\n";
    out += "Si no necesitas herramientas responde directamente al usuario en texto plano.\n";
    return out;
}

std::string format_tool_results_section(const std::vector<ToolResult>& results) {
    if (results.empty()) return "";

    std::string out = "\n\nResultados de tus herramientas previas:\n";
    for (const auto& r : results) {
        json j;
        j["id"]      = r.id;
        j["content"] = r.content;
        if (r.is_error) j["is_error"] = true;
        out += "<tool_result>";
        out += j.dump();
        out += "</tool_result>\n";
    }
    out += "\nContinua tu razonamiento usando estos resultados.\n";
    return out;
}

} // namespace alfred
