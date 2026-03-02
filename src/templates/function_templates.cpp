// ============================================================================
// function_templates.cpp - Templates de funciones
// ============================================================================
// JS: function identity(x) { return x; }  -> acepta cualquier tipo en runtime
// C++: template<typename T> T identity(T x) { return x; }
//      -> el compilador GENERA una version por cada tipo que uses
//
// Templates son "generics" resueltos en compilacion.
// TypeScript tiene generics: function identity<T>(x: T): T
// C++ templates son similares pero mas potentes y sin overhead.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <cmath>
#include "utils.h"

// -----------------------------------------------------------------
// TEMPLATE BASICO
// T es un placeholder que el compilador reemplaza con el tipo real
// -----------------------------------------------------------------
template<typename T>
T maximo(T a, T b) {
    return (a > b) ? a : b;
}

// -----------------------------------------------------------------
// TEMPLATE CON MULTIPLES TIPOS
// -----------------------------------------------------------------
template<typename T, typename U>
auto sumar(T a, U b) {
    // auto como retorno: el compilador deduce el tipo resultante
    // int + double = double (promocion automatica)
    return a + b;
}

// -----------------------------------------------------------------
// TEMPLATE PARA IMPRIMIR CUALQUIER CONTENEDOR
// Similar a una funcion generica que acepta Array<T> en TypeScript
// -----------------------------------------------------------------
template<typename Container>
void imprimir_contenedor(const std::string& nombre, const Container& contenedor) {
    std::cout << "  " << nombre << " = [";
    bool primero = true;
    for (const auto& elem : contenedor) {
        if (!primero) std::cout << ", ";
        std::cout << elem;
        primero = false;
    }
    std::cout << "] (size: " << contenedor.size() << ")\n";
}

// -----------------------------------------------------------------
// TEMPLATE PARA SIMILITUD COSENO (util para Alfred)
// Funciona con float, double, o cualquier tipo numerico
// -----------------------------------------------------------------
template<typename T>
double cosine_similarity(const std::vector<T>& a, const std::vector<T>& b) {
    if (a.size() != b.size() || a.empty()) return 0.0;

    double dot_product = 0.0;
    double norm_a = 0.0;
    double norm_b = 0.0;

    for (size_t i = 0; i < a.size(); ++i) {
        dot_product += static_cast<double>(a[i]) * static_cast<double>(b[i]);
        norm_a += static_cast<double>(a[i]) * static_cast<double>(a[i]);
        norm_b += static_cast<double>(b[i]) * static_cast<double>(b[i]);
    }

    double denominator = std::sqrt(norm_a) * std::sqrt(norm_b);
    if (denominator == 0.0) return 0.0;

    return dot_product / denominator;
}

// -----------------------------------------------------------------
// TEMPLATE CON RESTRICCIONES (C++20 concepts preview)
// Limita que tipos pueden usarse
// -----------------------------------------------------------------
template<typename T>
T clamp(T valor, T minimo, T maximo_val) {
    if (valor < minimo) return minimo;
    if (valor > maximo_val) return maximo_val;
    return valor;
}

// -----------------------------------------------------------------
// TEMPLATE VARIADIC (numero variable de argumentos)
// Como ...args en JS pero tipado y en compilacion
// -----------------------------------------------------------------
template<typename T>
void log_linea(const T& valor) {
    std::cout << valor << "\n";
}

template<typename T, typename... Args>
void log_linea(const T& primer, const Args&... resto) {
    std::cout << primer << " ";
    log_linea(resto...);  // Recursion en compilacion
}

int main() {
    alfred::print_separator("TEMPLATES DE FUNCIONES");

    // -----------------------------------------------------------------
    // TEMPLATE BASICO
    // -----------------------------------------------------------------
    alfred::print_lesson("Template basico",
        "El compilador genera maximo<int>, maximo<double>, maximo<string>.");

    std::cout << "  maximo(3, 7)           = " << maximo(3, 7) << "\n";
    std::cout << "  maximo(3.14, 2.71)     = " << maximo(3.14, 2.71) << "\n";
    std::cout << "  maximo(\"beta\", \"alpha\") = " << maximo(std::string("beta"), std::string("alpha")) << "\n";

    // El compilador infiere T de los argumentos
    // No necesitas escribir maximo<int>(3, 7) (aunque puedes)

    // -----------------------------------------------------------------
    // MULTIPLES TIPOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Multiples tipos template",
        "Diferentes tipos en la misma funcion. El compilador resuelve.");

    std::cout << "  sumar(5, 3.14)  = " << sumar(5, 3.14) << " (int + double = double)\n";
    std::cout << "  sumar(10, 20L)  = " << sumar(10, 20L) << " (int + long = long)\n";

    // -----------------------------------------------------------------
    // CONTENEDORES GENERICOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Templates con contenedores",
        "Una funcion que acepta cualquier tipo de contenedor.");

    std::vector<int> enteros = {1, 2, 3, 4, 5};
    std::vector<std::string> textos = {"hola", "mundo", "alfred"};
    std::vector<double> decimales = {0.1, 0.5, 0.9};

    imprimir_contenedor("enteros", enteros);
    imprimir_contenedor("textos", textos);
    imprimir_contenedor("decimales", decimales);

    // -----------------------------------------------------------------
    // SIMILITUD COSENO (practica para Alfred)
    // -----------------------------------------------------------------
    alfred::print_lesson("Cosine Similarity (template)",
        "Funciona con float o double. Critico para busqueda vectorial.");

    std::vector<float> embedding_a = {0.1f, 0.5f, 0.3f, 0.8f};
    std::vector<float> embedding_b = {0.2f, 0.4f, 0.35f, 0.75f};
    std::vector<float> embedding_c = {-0.5f, -0.3f, 0.1f, -0.9f};

    std::cout << "\n  Similitud A vs B: " << cosine_similarity(embedding_a, embedding_b)
              << " (similares)\n";
    std::cout << "  Similitud A vs C: " << cosine_similarity(embedding_a, embedding_c)
              << " (opuestos)\n";
    std::cout << "  Similitud A vs A: " << cosine_similarity(embedding_a, embedding_a)
              << " (identico)\n";

    // Tambien funciona con double
    std::vector<double> emb_d = {0.1, 0.5, 0.3, 0.8};
    std::vector<double> emb_e = {0.2, 0.4, 0.35, 0.75};
    std::cout << "  Similitud (double): " << cosine_similarity(emb_d, emb_e) << "\n";

    // -----------------------------------------------------------------
    // CLAMP
    // -----------------------------------------------------------------
    alfred::print_lesson("Template clamp",
        "Limita un valor a un rango. Util para temperatura del LLM.");

    double temp = 2.5;
    std::cout << "\n  clamp(2.5, 0.0, 2.0) = " << clamp(temp, 0.0, 2.0) << "\n";
    std::cout << "  clamp(-0.5, 0.0, 2.0) = " << clamp(-0.5, 0.0, 2.0) << "\n";
    std::cout << "  clamp(0.7, 0.0, 2.0) = " << clamp(0.7, 0.0, 2.0) << "\n";

    int tokens = 8000;
    std::cout << "  clamp(8000, 0, 4096) = " << clamp(tokens, 0, 4096) << "\n";

    // -----------------------------------------------------------------
    // VARIADIC TEMPLATE (como ...args)
    // -----------------------------------------------------------------
    alfred::print_lesson("Variadic templates (...args)",
        "Numero variable de argumentos, tipados en compilacion.");

    std::cout << "  ";
    log_linea("GPU:", "RTX 4060", "| VRAM:", 8192, "MB");
    std::cout << "  ";
    log_linea("Modelo:", "gemma2:9b", "| Temp:", 0.7);

    alfred::print_separator();
    std::cout << "  Leccion clave: Templates = generics resueltos en compilacion.\n";
    std::cout << "  Zero overhead: el compilador genera codigo para cada tipo.\n";
    std::cout << "  Similar a TypeScript generics pero sin runtime cost.\n";
    std::cout << "  Para Alfred: operaciones vectoriales, caches, wrappers.\n";
    alfred::print_separator();

    return 0;
}
