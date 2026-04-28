// ============================================================================
// tool_protocol.h - Tool/function calling sobre LLMs locales
// ============================================================================
// Soporta el bucle agentico de Alfred (Fase 0 del plan VSC+MCP).
//
// Como los modelos GGUF locales no siempre tienen tool-calling nativo,
// usamos un protocolo basado en marcadores de texto que el modelo aprende
// del system prompt:
//
//   <tool_call>{"id":"call_1","name":"read_file","arguments":{"path":"a.cpp"}}</tool_call>
//
// `ToolCallParser` consume el stream de tokens generado por el LLM y emite
// dos streams "limpios": tokens de texto visibles al usuario y tool_calls
// estructuradas. Soporta fragmentacion: cualquier token puede traer parte
// de un marcador de apertura/cierre.
// ============================================================================
#pragma once

#include <nlohmann/json.hpp>

#include <functional>
#include <string>
#include <vector>

namespace alfred {

using json = nlohmann::json;

// Especificacion de una herramienta disponible para el modelo.
struct ToolSpec {
    std::string name;
    std::string description;
    json        input_schema;   // JSONSchema draft-07 del objeto de argumentos
};

// Tool-call emitida por el modelo durante la generacion.
struct ToolCall {
    std::string id;
    std::string name;
    json        arguments;
};

// Resultado que el cliente devuelve al backend para continuar el bucle.
struct ToolResult {
    std::string id;
    std::string content;        // texto plano (puede ser JSON serializado)
    bool        is_error = false;
};

// Parser stateful que recibe tokens y emite (texto, tool_calls).
//
// Uso tipico desde un callback de streaming:
//
//   ToolCallParser parser;
//   auto on_token = [&](const std::string& tok) {
//       parser.feed(tok,
//           [&](const std::string& clean) { sse_send_token(clean); },
//           [&](const ToolCall& tc)        { sse_send_tool_call(tc); });
//       return true;
//   };
//   ...
//   parser.flush(on_text, on_tool);   // al terminar la generacion
//
class ToolCallParser {
public:
    using TextEmit     = std::function<void(const std::string&)>;
    using ToolCallEmit = std::function<void(const ToolCall&)>;

    ToolCallParser();

    // Procesa un fragmento del stream. Puede no emitir nada si el chunk
    // queda retenido como posible prefijo de un marcador.
    void feed(const std::string& chunk,
              const TextEmit&     on_text,
              const ToolCallEmit& on_tool_call);

    // Vuelca cualquier residuo retenido. Llamar tras el ultimo feed().
    // Si hubo `<tool_call>` sin cerrar, su contenido se entrega como texto
    // literal (incluyendo el marcador) para no perder informacion.
    void flush(const TextEmit&     on_text,
               const ToolCallEmit& on_tool_call);

    // Devuelve true si el modelo abrio al menos una tool_call valida desde
    // que se construyo el parser. Util para decidir el `finish_reason`.
    bool saw_tool_call() const { return saw_tool_call_; }

private:
    enum class State { TEXT, INSIDE };

    State        state_         = State::TEXT;
    std::string  buffer_;        // residuo retenido entre feed()s
    std::string  tool_content_;  // acumulado dentro de un <tool_call>
    bool         saw_tool_call_ = false;

    // Procesa el buffer hasta que no haya mas progreso posible. Usa
    // `final_pass=true` cuando el caller llama flush() para emitir tambien
    // el sufijo que en streaming se hubiera retenido.
    void drain(const TextEmit& on_text, const ToolCallEmit& on_tool_call,
               bool final_pass);

    // Intenta parsear `tool_content_` como JSON de tool_call. Si tiene
    // exito emite y devuelve true; si falla, emite como texto literal el
    // bloque <tool_call>...</tool_call> y devuelve false.
    bool emit_tool_call(const TextEmit& on_text,
                        const ToolCallEmit& on_tool_call);
};

// ----------------------------------------------------------------------------
// Helpers de prompt
// ----------------------------------------------------------------------------

// Construye el bloque de instrucciones que se inyecta en el system prompt
// para que el modelo sepa que tools tiene y como invocarlas. Si `tools`
// esta vacio devuelve "" (no agregar nada al prompt).
std::string format_tools_section(const std::vector<ToolSpec>& tools);

// Construye el bloque que representa los resultados de tool_calls previas
// en una continuacion del bucle agentico. Si `results` esta vacio devuelve "".
std::string format_tool_results_section(const std::vector<ToolResult>& results);

// Marcadores expuestos para tests.
extern const char* const TOOL_CALL_OPEN;   // "<tool_call>"
extern const char* const TOOL_CALL_CLOSE;  // "</tool_call>"

} // namespace alfred
