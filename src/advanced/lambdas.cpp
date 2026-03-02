// ============================================================================
// lambdas.cpp - Funciones lambda en C++
// ============================================================================
// JS: const fn = (x) => x * 2;
// C++: auto fn = [](int x) { return x * 2; };
//
// Las lambdas de C++ son mas potentes que las de JS porque pueden
// CAPTURAR variables del scope de diferentes formas:
// por valor (copia), por referencia, o mover.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <functional>  // std::function
#include "utils.h"

int main() {
    alfred::print_separator("LAMBDAS EN C++");

    // -----------------------------------------------------------------
    // LAMBDA BASICA
    // -----------------------------------------------------------------
    alfred::print_lesson("Lambda basica",
        "[captura](params) -> retorno { cuerpo }");

    // JS: const sumar = (a, b) => a + b;
    auto sumar = [](int a, int b) { return a + b; };
    auto saludar = [](const std::string& nombre) {
        return "Hola, " + nombre + "!";
    };

    std::cout << "  sumar(3, 4) = " << sumar(3, 4) << "\n";
    std::cout << "  saludar(\"Alfred\") = " << saludar("Alfred") << "\n";

    // -----------------------------------------------------------------
    // CAPTURA DE VARIABLES
    // La parte entre [] define que variables del scope exterior usa
    // -----------------------------------------------------------------
    alfred::print_lesson("Captura de variables [...]",
        "[] define que variables del exterior puede usar la lambda.");

    std::string modelo = "gemma2:9b";
    double temperatura = 0.7;
    int max_tokens = 4096;

    // [=] captura TODO por valor (copia)
    auto info_copia = [=]() {
        return modelo + " temp=" + std::to_string(temperatura);
        // modelo, temperatura son COPIAS, no se pueden modificar
    };
    std::cout << "\n  [=] captura por valor: " << info_copia() << "\n";

    // [&] captura TODO por referencia
    auto incrementar = [&]() {
        temperatura += 0.1;  // Modifica el ORIGINAL
        max_tokens *= 2;     // Modifica el ORIGINAL
    };
    incrementar();
    std::cout << "  [&] despues de modificar: temp=" << temperatura
              << " tokens=" << max_tokens << "\n";

    // Captura selectiva: elige que y como
    auto selectiva = [&modelo, temperatura]() {
        // modelo por referencia (puede leer el original)
        // temperatura por valor (tiene una copia)
        return modelo + " temp=" + std::to_string(temperatura);
    };
    std::cout << "  [&modelo, temp]: " << selectiva() << "\n";

    // Captura mutable: permite modificar las copias
    int contador = 0;
    auto counter = [contador]() mutable {
        // Sin mutable, no podria modificar la copia
        return ++contador;
    };
    std::cout << "\n  [mutable] counter(): " << counter() << ", " << counter() << ", " << counter() << "\n";
    std::cout << "  Original sin cambiar: " << contador << "\n";

    // -----------------------------------------------------------------
    // LAMBDAS CON ALGORITMOS STL
    // -----------------------------------------------------------------
    alfred::print_lesson("Lambdas con STL",
        "Las lambdas son perfectas para sort, filter, transform, etc.");

    std::vector<double> scores = {0.85, 0.42, 0.92, 0.78, 0.95, 0.31, 0.88};

    // Filtrar (como arr.filter())
    double threshold = 0.8;
    std::vector<double> altos;
    std::copy_if(scores.begin(), scores.end(), std::back_inserter(altos),
        [threshold](double s) { return s >= threshold; });

    std::cout << "\n  Scores >= " << threshold << ": ";
    for (double s : altos) std::cout << s << " ";
    std::cout << "\n";

    // Ordenar descendente (como arr.sort((a,b) => b-a))
    std::sort(scores.begin(), scores.end(),
        [](double a, double b) { return a > b; });

    std::cout << "  Ordenados desc: ";
    for (double s : scores) std::cout << s << " ";
    std::cout << "\n";

    // Transformar (como arr.map())
    std::vector<std::string> labels;
    labels.reserve(scores.size());
    std::transform(scores.begin(), scores.end(), std::back_inserter(labels),
        [](double s) {
            if (s >= 0.9) return std::string("excelente");
            if (s >= 0.7) return std::string("bueno");
            return std::string("bajo");
        });

    std::cout << "  Labels: ";
    for (const auto& l : labels) std::cout << l << " ";
    std::cout << "\n";

    // -----------------------------------------------------------------
    // std::function (puntero a funcion seguro)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::function",
        "Almacena cualquier callable: lambda, funcion, metodo.");

    // JS: const callbacks = [fn1, fn2, fn3];
    using Preprocessor = std::function<std::string(const std::string&)>;

    std::vector<Preprocessor> pipeline;

    pipeline.push_back([](const std::string& text) {
        std::string lower = text;
        for (auto& c : lower) {
            c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        }
        return lower;
    });

    pipeline.push_back([](const std::string& text) {
        // Trim basico
        size_t start = text.find_first_not_of(' ');
        size_t end = text.find_last_not_of(' ');
        if (start == std::string::npos) return std::string();
        return text.substr(start, end - start + 1);
    });

    pipeline.push_back([](const std::string& text) {
        return "[procesado] " + text;
    });

    // Ejecutar pipeline
    std::string input = "  Que Es CUDA?  ";
    std::string output = input;
    for (const auto& step : pipeline) {
        output = step(output);
    }
    std::cout << "\n  Input:  \"" << input << "\"\n";
    std::cout << "  Output: \"" << output << "\"\n";

    // -----------------------------------------------------------------
    // LAMBDAS GENERICAS (C++14, auto en parametros)
    // -----------------------------------------------------------------
    alfred::print_lesson("Lambda generica (auto params)",
        "auto en parametros = template implicito. C++14.");

    auto imprimir = [](const auto& valor) {
        std::cout << "  [" << valor << "]\n";
    };

    imprimir(42);
    imprimir(3.14);
    imprimir("Alfred");
    imprimir(std::string("C++ moderno"));

    // -----------------------------------------------------------------
    // IIFE (Immediately Invoked)
    // -----------------------------------------------------------------
    alfred::print_lesson("IIFE en C++",
        "Lambda ejecutada inmediatamente. Como (function(){})() en JS.");

    // JS: const config = (() => { ... })();
    const auto config = []() {
        std::string resultado = "modelo=gemma2";
        resultado += ";temp=0.7";
        resultado += ";gpu=true";
        return resultado;
    }();  // () al final = ejecuta inmediatamente

    std::cout << "\n  Config (IIFE): " << config << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Las lambdas de C++ son mas potentes que en JS.\n";
    std::cout << "  La captura [] te da control sobre que datos usa la lambda.\n";
    std::cout << "  [=] copia, [&] referencia, [var] selectivo.\n";
    std::cout << "  Ideales para STL algorithms y callbacks.\n";
    std::cout << "  Para Alfred: procesamiento de texto, filtrado de documentos.\n";
    alfred::print_separator();

    return 0;
}
