// ============================================================================
// utils.h - Utilidades compartidas para el proyecto de aprendizaje
// ============================================================================
// En C++ los headers (.h / .hpp) declaran interfaces que otros archivos usan.
// Esto es similar a exportar funciones en JS, pero el compilador lo resuelve
// en tiempo de compilacion, no en runtime.
//
// #pragma once: evita que este header se incluya multiples veces.
// Es el equivalente moderno de los include guards (#ifndef / #define / #endif).
// ============================================================================

#pragma once

#include <iostream>
#include <string>

// En C++ puedes agrupar funciones en namespaces para evitar colisiones.
// Es como un modulo en JS pero resuelto en compilacion.
namespace alfred {

// Imprime un separador visual en consola
inline void print_separator(const std::string& title = "") {
    std::cout << "\n";
    std::cout << "============================================================\n";
    if (!title.empty()) {
        std::cout << "  " << title << "\n";
        std::cout << "============================================================\n";
    }
}

// Imprime una leccion con formato
inline void print_lesson(const std::string& topic, const std::string& explanation) {
    std::cout << "\n[" << topic << "]\n";
    std::cout << "  -> " << explanation << "\n";
}

// Imprime el resultado de un ejemplo
inline void print_example(const std::string& label) {
    std::cout << "  " << label << ": ";
}

inline void print_example(const std::string& code, const std::string& result) {
    std::cout << "  Codigo : " << code << "\n";
    std::cout << "  Result : " << result << "\n";
}

// Pausa la ejecucion hasta que el usuario presione Enter
inline void wait_for_enter() {
    std::cout << "\n  [Presiona Enter para continuar...]\n";
    std::cin.ignore();
    std::cin.get();
}

} // namespace alfred
