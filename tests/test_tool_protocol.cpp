// ============================================================================
// test_tool_protocol.cpp - Tests del parser de tool-calls (Fase 0 plan VSC+MCP)
// ============================================================================
// Sin framework: assert() puro como en test_basics.cpp.
// El parser es la pieza mas delicada de la fase 0 porque tiene que sobrevivir
// a fragmentacion arbitraria del stream de tokens GGUF.
// ============================================================================
#include "alfred/tool_protocol.h"

#include <cassert>
#include <iostream>
#include <string>
#include <vector>

using namespace alfred;

namespace {

struct Captured {
    std::string text;
    std::vector<ToolCall> tool_calls;

    ToolCallParser::TextEmit on_text() {
        return [this](const std::string& s) { text += s; };
    }
    ToolCallParser::ToolCallEmit on_tool() {
        return [this](const ToolCall& tc) { tool_calls.push_back(tc); };
    }
};

// Alimenta el parser con `input` partido en chunks de tamano `chunk_size`.
// chunk_size=0 envia todo de golpe.
Captured run_parser(const std::string& input, size_t chunk_size) {
    Captured out;
    ToolCallParser parser;
    if (chunk_size == 0) {
        parser.feed(input, out.on_text(), out.on_tool());
    } else {
        for (size_t i = 0; i < input.size(); i += chunk_size) {
            parser.feed(input.substr(i, chunk_size), out.on_text(), out.on_tool());
        }
    }
    parser.flush(out.on_text(), out.on_tool());
    return out;
}

void test_plain_text_passes_through() {
    auto r = run_parser("Hola, esto es texto plano sin tags.", 0);
    assert(r.text == "Hola, esto es texto plano sin tags.");
    assert(r.tool_calls.empty());
    std::cout << "  test_plain_text_passes_through PASSED\n";
}

void test_plain_text_with_lt_char() {
    // Un < suelto no debe activar el modo INSIDE.
    auto r = run_parser("a < b && c < d", 0);
    assert(r.text == "a < b && c < d");
    assert(r.tool_calls.empty());
    std::cout << "  test_plain_text_with_lt_char PASSED\n";
}

void test_single_tool_call_whole() {
    std::string in =
        "Voy a leerlo. "
        "<tool_call>{\"id\":\"c1\",\"name\":\"read_file\",\"arguments\":{\"path\":\"a.cpp\"}}</tool_call>"
        " Listo.";
    auto r = run_parser(in, 0);
    assert(r.text == "Voy a leerlo.  Listo.");
    assert(r.tool_calls.size() == 1);
    assert(r.tool_calls[0].id == "c1");
    assert(r.tool_calls[0].name == "read_file");
    assert(r.tool_calls[0].arguments.value("path", "") == "a.cpp");
    std::cout << "  test_single_tool_call_whole PASSED\n";
}

void test_single_tool_call_split_byte_by_byte() {
    // Caso mas adverso: cada byte llega por separado. Es como van los
    // tokens GGUF en algunos modelos donde cada token es 1-2 chars.
    std::string in =
        "ok<tool_call>{\"id\":\"x\",\"name\":\"ping\",\"arguments\":{}}</tool_call>fin";
    auto r = run_parser(in, 1);
    assert(r.text == "okfin");
    assert(r.tool_calls.size() == 1);
    assert(r.tool_calls[0].name == "ping");
    assert(r.tool_calls[0].id == "x");
    std::cout << "  test_single_tool_call_split_byte_by_byte PASSED\n";
}

void test_tool_call_split_in_open_marker() {
    // El chunk corta justo dentro del marcador de apertura.
    std::string in =
        "antes<tool_call>{\"name\":\"t\",\"arguments\":{}}</tool_call>despues";
    // chunk_size=4: divide "<too|l_ca|ll>{|...|" etc.
    auto r = run_parser(in, 4);
    assert(r.text == "antesdespues");
    assert(r.tool_calls.size() == 1);
    assert(r.tool_calls[0].name == "t");
    std::cout << "  test_tool_call_split_in_open_marker PASSED\n";
}

void test_tool_call_split_in_close_marker() {
    std::string in =
        "x<tool_call>{\"name\":\"q\",\"arguments\":{\"a\":1}}</tool_call>y";
    auto r = run_parser(in, 3);
    assert(r.text == "xy");
    assert(r.tool_calls.size() == 1);
    assert(r.tool_calls[0].name == "q");
    assert(r.tool_calls[0].arguments.value("a", 0) == 1);
    std::cout << "  test_tool_call_split_in_close_marker PASSED\n";
}

void test_multiple_tool_calls() {
    std::string in =
        "<tool_call>{\"name\":\"a\",\"arguments\":{}}</tool_call>"
        "entre"
        "<tool_call>{\"name\":\"b\",\"arguments\":{}}</tool_call>"
        "final";
    auto r = run_parser(in, 7);
    assert(r.text == "entrefinal");
    assert(r.tool_calls.size() == 2);
    assert(r.tool_calls[0].name == "a");
    assert(r.tool_calls[1].name == "b");
    std::cout << "  test_multiple_tool_calls PASSED\n";
}

void test_invalid_json_falls_back_to_text() {
    // Si el modelo emite basura dentro de los marcadores, no debemos
    // tragarnoslo. Lo entregamos como texto literal incluyendo los marcadores.
    std::string in = "<tool_call>esto no es json</tool_call>";
    auto r = run_parser(in, 0);
    assert(r.tool_calls.empty());
    assert(r.text == "<tool_call>esto no es json</tool_call>");
    std::cout << "  test_invalid_json_falls_back_to_text PASSED\n";
}

void test_missing_name_falls_back_to_text() {
    std::string in = "<tool_call>{\"arguments\":{}}</tool_call>";
    auto r = run_parser(in, 0);
    assert(r.tool_calls.empty());
    assert(r.text.find("<tool_call>") != std::string::npos);
    std::cout << "  test_missing_name_falls_back_to_text PASSED\n";
}

void test_unclosed_tool_call_dumped_on_flush() {
    // Si el modelo abre pero nunca cierra (cancelacion, EOS prematuro),
    // flush() debe volcarlo como texto literal para que el cliente lo vea.
    std::string in = "antes<tool_call>{\"name\":\"x\",\"arguments\":{}}";
    auto r = run_parser(in, 0);
    assert(r.tool_calls.empty());
    assert(r.text.find("antes") != std::string::npos);
    assert(r.text.find("<tool_call>") != std::string::npos);
    std::cout << "  test_unclosed_tool_call_dumped_on_flush PASSED\n";
}

void test_pending_open_prefix_is_held() {
    // Sin flush, un sufijo "<tool_" debe quedar retenido (no emitido aun).
    Captured out;
    ToolCallParser parser;
    parser.feed("hola <tool_", out.on_text(), out.on_tool());
    assert(out.text == "hola ");      // "<tool_" se retiene
    parser.feed("call>{\"name\":\"y\",\"arguments\":{}}</tool_call> mundo",
                out.on_text(), out.on_tool());
    parser.flush(out.on_text(), out.on_tool());
    assert(out.text == "hola  mundo");
    assert(out.tool_calls.size() == 1);
    assert(out.tool_calls[0].name == "y");
    std::cout << "  test_pending_open_prefix_is_held PASSED\n";
}

void test_saw_tool_call_flag() {
    ToolCallParser p1;
    Captured o1;
    p1.feed("solo texto", o1.on_text(), o1.on_tool());
    p1.flush(o1.on_text(), o1.on_tool());
    assert(p1.saw_tool_call() == false);

    ToolCallParser p2;
    Captured o2;
    p2.feed("<tool_call>{\"name\":\"z\",\"arguments\":{}}</tool_call>",
            o2.on_text(), o2.on_tool());
    p2.flush(o2.on_text(), o2.on_tool());
    assert(p2.saw_tool_call() == true);
    std::cout << "  test_saw_tool_call_flag PASSED\n";
}

void test_format_tools_section_empty() {
    assert(format_tools_section({}).empty());
    std::cout << "  test_format_tools_section_empty PASSED\n";
}

void test_format_tools_section_serializes_specs() {
    ToolSpec t;
    t.name = "read_file";
    t.description = "Lee un archivo";
    t.input_schema = nlohmann::json{
        {"type", "object"},
        {"properties", {{"path", {{"type", "string"}}}}},
    };
    auto s = format_tools_section({t});
    assert(s.find("<tools>") != std::string::npos);
    assert(s.find("read_file") != std::string::npos);
    assert(s.find("Lee un archivo") != std::string::npos);
    assert(s.find("<tool_call>") != std::string::npos);  // instrucciones
    std::cout << "  test_format_tools_section_serializes_specs PASSED\n";
}

void test_format_tool_results_section() {
    ToolResult r;
    r.id = "call_1";
    r.content = "contenido del archivo";
    auto s = format_tool_results_section({r});
    assert(s.find("call_1") != std::string::npos);
    assert(s.find("contenido del archivo") != std::string::npos);
    assert(s.find("<tool_result id=\"call_1\"") != std::string::npos);
    std::cout << "  test_format_tool_results_section PASSED\n";
}

void test_format_tool_results_empty() {
    assert(format_tool_results_section({}).empty());
    std::cout << "  test_format_tool_results_empty PASSED\n";
}

} // namespace

int main() {
    std::cout << "=== test_tool_protocol ===\n";

    test_plain_text_passes_through();
    test_plain_text_with_lt_char();
    test_single_tool_call_whole();
    test_single_tool_call_split_byte_by_byte();
    test_tool_call_split_in_open_marker();
    test_tool_call_split_in_close_marker();
    test_multiple_tool_calls();
    test_invalid_json_falls_back_to_text();
    test_missing_name_falls_back_to_text();
    test_unclosed_tool_call_dumped_on_flush();
    test_pending_open_prefix_is_held();
    test_saw_tool_call_flag();
    test_format_tools_section_empty();
    test_format_tools_section_serializes_specs();
    test_format_tool_results_section();
    test_format_tool_results_empty();

    std::cout << "All tool_protocol tests PASSED\n";
    return 0;
}
