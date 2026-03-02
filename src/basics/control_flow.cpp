// ============================================================================
// control_flow.cpp - Control de flujo en C++
// ============================================================================
// La mayoria de estructuras de control son identicas a JS (misma herencia de C).
// Las diferencias clave: switch es mas estricto, y hay init-statements
// en if/switch desde C++17.
// ============================================================================

#include <iostream>
#include <string>
#include "utils.h"

int main() {
    alfred::print_separator("CONTROL DE FLUJO EN C++");

    // -----------------------------------------------------------------
    // IF / ELSE - Casi identico a JS
    // Diferencia: la condicion DEBE ser convertible a bool.
    // En JS: if ("") es falsy. En C++: if("") es true (puntero no nulo).
    // -----------------------------------------------------------------
    alfred::print_lesson("if/else",
        "Mismo syntax que JS, pero sin coercion truthy/falsy implicita.");

    int temperatura = 25;

    if (temperatura > 30) {
        std::cout << "  Hace calor\n";
    } else if (temperatura > 15) {
        std::cout << "  Temperatura agradable: " << temperatura << " C\n";
    } else {
        std::cout << "  Hace frio\n";
    }

    // C++17: if con inicializador (no existe en JS)
    // La variable solo vive dentro del bloque if
    alfred::print_lesson("if con init (C++17)",
        "Puedes declarar variables dentro del if. Scope limitado.");

    if (int resultado = temperatura * 2; resultado > 40) {
        std::cout << "  Resultado alto: " << resultado << "\n";
    } else {
        std::cout << "  Resultado normal: " << resultado << "\n";
    }
    // resultado ya no existe aqui - el scope termino

    // -----------------------------------------------------------------
    // SWITCH - Mas estricto que JS
    // Solo funciona con tipos integrales (int, char, enum).
    // No puedes usar strings como en JS.
    // -----------------------------------------------------------------
    alfred::print_lesson("switch",
        "Solo acepta int/char/enum. No strings como en JS.");

    enum class GpuBrand { NVIDIA, AMD, INTEL, APPLE, UNKNOWN };
    GpuBrand gpu = GpuBrand::NVIDIA;

    switch (gpu) {
        case GpuBrand::NVIDIA:
            std::cout << "  GPU: NVIDIA - CUDA disponible\n";
            break;  // MUY IMPORTANTE: sin break cae al siguiente caso
        case GpuBrand::AMD:
            std::cout << "  GPU: AMD - ROCm disponible\n";
            break;
        case GpuBrand::INTEL:
            std::cout << "  GPU: Intel - OneAPI disponible\n";
            break;
        default:
            std::cout << "  GPU: No reconocida\n";
            break;
    }

    // -----------------------------------------------------------------
    // LOOPS - for, while, do-while, range-based for
    // -----------------------------------------------------------------
    alfred::print_lesson("for clasico",
        "Identico a JS. La variable del loop tiene scope limitado.");

    std::cout << "  Primeros 5 tokens: ";
    for (int i = 0; i < 5; ++i) {
        // ++i vs i++: ambos incrementan, pero ++i es mas eficiente
        // en C++ porque no crea una copia temporal
        std::cout << "token_" << i << " ";
    }
    std::cout << "\n";

    // Range-based for (como for...of en JS)
    alfred::print_lesson("range-based for (C++11)",
        "Como for...of en JS. Itera sobre cualquier contenedor.");

    std::string modelos[] = {"gemma2", "llama3", "mistral", "phi3"};

    std::cout << "  Modelos disponibles:\n";
    for (const auto& modelo : modelos) {
        // const auto& = referencia constante (no copia el string)
        // En JS for...of siempre copia. Aqui evitas copias innecesarias.
        std::cout << "    - " << modelo << "\n";
    }

    // While
    alfred::print_lesson("while / do-while",
        "Identico a JS. do-while ejecuta al menos una vez.");

    int intentos = 0;
    int max_intentos = 3;

    while (intentos < max_intentos) {
        std::cout << "  Intento " << intentos + 1 << " de " << max_intentos << "\n";
        ++intentos;
    }

    // -----------------------------------------------------------------
    // TERNARIO - Identico a JS
    // -----------------------------------------------------------------
    alfred::print_lesson("operador ternario",
        "Identico a JS: condicion ? verdadero : falso");

    bool cuda_disponible = true;
    std::string dispositivo = cuda_disponible ? "GPU (CUDA)" : "CPU";
    std::cout << "  Ejecutando en: " << dispositivo << "\n";

    // -----------------------------------------------------------------
    // COMPARACIONES - Sin sorpresas como JS
    // No hay == vs === porque los tipos son estrictos
    // -----------------------------------------------------------------
    alfred::print_lesson("comparaciones",
        "No existe === como en JS. Todo es tipado, no hay coercion.");

    int a = 5;
    double b = 5.0;

    // En C++ esto compara valores con conversion implicita segura (int -> double)
    if (a == b) {
        std::cout << "  5 (int) == 5.0 (double) -> true (conversion segura)\n";
    }

    // En JS: 5 == "5" es true (!). En C++ no compila porque int != string.
    // if (a == "5") {} // ERROR de compilacion

    alfred::print_separator();
    std::cout << "  Leccion clave: El control de flujo es casi identico a JS.\n";
    std::cout << "  La gran ventaja es que el compilador detecta errores de tipo\n";
    std::cout << "  en las condiciones ANTES de ejecutar.\n";
    alfred::print_separator();

    return 0;
}
