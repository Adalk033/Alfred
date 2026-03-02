// ============================================================================
// polymorphism.cpp - Polimorfismo en C++
// ============================================================================
// Polimorfismo = tratar diferentes tipos a traves de una interfaz comun.
// En JS esto pasa naturalmente (duck typing): si tiene .quack(), es un pato.
// En C++ es explicito via virtual functions y puede resolverse en:
//   - Runtime (virtual dispatch) -> como JS
//   - Compilacion (templates) -> mas rapido, no existe en JS
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <memory>    // std::unique_ptr
#include "utils.h"

// -----------------------------------------------------------------
// INTERFAZ (clase abstracta pura)
// En C++ no hay keyword "interface" como en TypeScript.
// Se usa una clase con todos los metodos virtuales puros.
// -----------------------------------------------------------------

class DocumentParser {
public:
    virtual ~DocumentParser() = default;

    // Metodos puros = interfaz que DEBE implementarse
    virtual bool puede_parsear(const std::string& extension) const = 0;
    virtual std::string extraer_texto(const std::string& ruta) const = 0;
    virtual std::string get_tipo() const = 0;
};

// Implementaciones concretas

class PdfParser : public DocumentParser {
public:
    bool puede_parsear(const std::string& extension) const override {
        return extension == ".pdf";
    }

    std::string extraer_texto(const std::string& ruta) const override {
        return "[Texto extraido de PDF: " + ruta + "]";
    }

    std::string get_tipo() const override {
        return "PDF Parser (Poppler)";
    }
};

class TxtParser : public DocumentParser {
public:
    bool puede_parsear(const std::string& extension) const override {
        return extension == ".txt" || extension == ".md";
    }

    std::string extraer_texto(const std::string& ruta) const override {
        return "[Texto leido de TXT: " + ruta + "]";
    }

    std::string get_tipo() const override {
        return "Plain Text Parser";
    }
};

class DocxParser : public DocumentParser {
public:
    bool puede_parsear(const std::string& extension) const override {
        return extension == ".docx";
    }

    std::string extraer_texto(const std::string& ruta) const override {
        return "[Texto extraido de DOCX: " + ruta + "]";
    }

    std::string get_tipo() const override {
        return "DOCX Parser (libxml2)";
    }
};

// -----------------------------------------------------------------
// FUNCION QUE USA POLIMORFISMO
// Recibe la interfaz base, funciona con CUALQUIER implementacion.
// Esto es como recibir un parametro con duck typing en JS,
// pero el compilador verifica que el tipo sea correcto.
// -----------------------------------------------------------------

std::string procesar_documento(
    const DocumentParser& parser,
    const std::string& ruta)
{
    std::cout << "  Usando: " << parser.get_tipo() << "\n";
    return parser.extraer_texto(ruta);
}

// -----------------------------------------------------------------
// FACTORY: crea el parser correcto segun la extension
// Retorna un unique_ptr (smart pointer, ver modulo memory/)
// -----------------------------------------------------------------
std::unique_ptr<DocumentParser> crear_parser(const std::string& extension) {
    if (extension == ".pdf") {
        return std::make_unique<PdfParser>();
    } else if (extension == ".docx") {
        return std::make_unique<DocxParser>();
    } else if (extension == ".txt" || extension == ".md") {
        return std::make_unique<TxtParser>();
    }
    return nullptr;
}

// -----------------------------------------------------------------
// POLIMORFISMO EN COMPILACION (templates)
// Resuelto por el compilador, zero overhead en runtime.
// No existe equivalente en JS/PHP.
// -----------------------------------------------------------------

// El compilador genera una version de esta funcion para cada tipo T
template<typename T>
void mostrar_info(const T& parser) {
    // T debe tener get_tipo() y puede_parsear()
    // Si no los tiene, ERROR de compilacion (no runtime)
    std::cout << "  Parser: " << parser.get_tipo() << "\n";
    std::cout << "  Soporta .pdf? " << (parser.puede_parsear(".pdf") ? "Si" : "No") << "\n";
}

int main() {
    alfred::print_separator("POLIMORFISMO EN C++");

    // -----------------------------------------------------------------
    // POLIMORFISMO RUNTIME (virtual dispatch)
    // -----------------------------------------------------------------
    alfred::print_lesson("Polimorfismo runtime (virtual)",
        "Diferentes tipos, misma interfaz. Como duck typing pero seguro.");

    PdfParser pdf;
    TxtParser txt;
    DocxParser docx;

    std::cout << "\n";
    std::cout << "  " << procesar_documento(pdf, "manual.pdf") << "\n";
    std::cout << "  " << procesar_documento(txt, "notas.txt") << "\n";
    std::cout << "  " << procesar_documento(docx, "informe.docx") << "\n";

    // -----------------------------------------------------------------
    // COLECCION POLIMORFICA
    // Un vector de punteros a la interfaz base
    // -----------------------------------------------------------------
    alfred::print_lesson("Coleccion polimorfica",
        "Vector de unique_ptr a la clase base. Cada uno es un tipo diferente.");

    std::vector<std::unique_ptr<DocumentParser>> parsers;
    parsers.push_back(std::make_unique<PdfParser>());
    parsers.push_back(std::make_unique<TxtParser>());
    parsers.push_back(std::make_unique<DocxParser>());

    // Buscar el parser correcto para un archivo
    std::string archivo = "documento.docx";
    std::string extension = archivo.substr(archivo.rfind('.'));

    std::cout << "\n  Buscando parser para: " << archivo << "\n";
    for (const auto& parser : parsers) {
        if (parser->puede_parsear(extension)) {
            std::cout << "  Encontrado: " << parser->get_tipo() << "\n";
            std::cout << "  " << parser->extraer_texto(archivo) << "\n";
            break;
        }
    }

    // -----------------------------------------------------------------
    // FACTORY PATTERN
    // -----------------------------------------------------------------
    alfred::print_lesson("Factory pattern",
        "Crea el objeto correcto segun parametros. Comun en C++.");

    std::vector<std::string> archivos = {
        "thesis.pdf", "notes.txt", "report.docx", "log.md"
    };

    std::cout << "\n  Procesando batch de documentos:\n";
    for (const auto& arch : archivos) {
        std::string ext = arch.substr(arch.rfind('.'));
        auto parser = crear_parser(ext);

        if (parser) {
            std::cout << "  " << parser->extraer_texto(arch) << "\n";
        } else {
            std::cout << "  [No hay parser para " << ext << "]\n";
        }
    }

    // -----------------------------------------------------------------
    // POLIMORFISMO EN COMPILACION
    // -----------------------------------------------------------------
    alfred::print_lesson("Polimorfismo compile-time (templates)",
        "El compilador genera codigo por tipo. Zero overhead.");

    std::cout << "\n";
    mostrar_info(pdf);
    mostrar_info(txt);
    mostrar_info(docx);

    alfred::print_separator();
    std::cout << "  Leccion clave: C++ tiene polimorfismo en runtime (virtual)\n";
    std::cout << "  Y en compilacion (templates). JS solo tiene runtime.\n";
    std::cout << "  virtual = flexibilidad, templates = rendimiento.\n";
    std::cout << "  Para Alfred: interfaces para parsers/engines,\n";
    std::cout << "  templates para operaciones criticas de rendimiento.\n";
    alfred::print_separator();

    return 0;
}
