// ============================================================================
// arrays.cpp - Arrays y contenedores basicos en C++
// ============================================================================
// JS: const arr = [1, 2, 3]; -> array dinamico, tipos mixtos
// C++: int arr[] = {1, 2, 3}; -> array fijo, un solo tipo
//
// C++ tiene arrays de tamano fijo (stack) y std::array (seguro)
// Para tamano dinamico usaras std::vector (ver modulo stl/).
// ============================================================================

#include <iostream>
#include <string>
#include <array>     // std::array - array seguro de tamano fijo
#include "utils.h"

int main() {
    alfred::print_separator("ARRAYS EN C++");

    // -----------------------------------------------------------------
    // ARRAY ESTILO C (raw array)
    // Vive en el stack. Tamano fijo en compilacion.
    // NO sabe su propio tamano (a diferencia de JS).
    // -----------------------------------------------------------------
    alfred::print_lesson("Array estilo C",
        "Tamano fijo, vive en el stack. No sabe su .length como en JS.");

    int numeros[5] = {10, 20, 30, 40, 50};

    // Acceso por indice (igual que JS)
    std::cout << "  numeros[0] = " << numeros[0] << "\n";
    std::cout << "  numeros[4] = " << numeros[4] << "\n";

    // PELIGRO: C++ NO verifica limites. Esto NO da error pero es UB.
    // numeros[10] = 999;  // Undefined Behavior - puede crashear o no

    // Para saber el tamano de un raw array:
    size_t tamano = sizeof(numeros) / sizeof(numeros[0]);
    std::cout << "  tamano = " << tamano << " (calculado manualmente)\n";

    // Iterar
    std::cout << "  Contenido: ";
    for (size_t i = 0; i < tamano; ++i) {
        std::cout << numeros[i] << " ";
    }
    std::cout << "\n";

    // -----------------------------------------------------------------
    // std::array (C++11) - RECOMENDADO sobre raw arrays
    // Sabe su tamano, tiene .at() con verificacion de limites,
    // y se comporta como un objeto normal.
    // -----------------------------------------------------------------
    alfred::print_lesson("std::array (C++11)",
        "Recomendado. Sabe su tamano, verifica limites con .at().");

    std::array<std::string, 4> modelos = {"gemma2", "llama3", "mistral", "phi3"};

    std::cout << "  size()  = " << modelos.size() << "\n";
    std::cout << "  front() = " << modelos.front() << " (como arr[0])\n";
    std::cout << "  back()  = " << modelos.back() << " (como arr[arr.length-1])\n";
    std::cout << "  at(1)   = " << modelos.at(1) << " (con verificacion de limites)\n";

    // .at() lanza excepcion si el indice es invalido
    try {
        std::cout << "  at(10)  = " << modelos.at(10) << "\n";
    } catch (const std::out_of_range& e) {
        std::cout << "  at(10)  = ERROR: " << e.what() << "\n";
    }

    // Range-based for
    std::cout << "  Modelos: ";
    for (const auto& m : modelos) {
        std::cout << m << " ";
    }
    std::cout << "\n";

    // -----------------------------------------------------------------
    // ARRAYS MULTIDIMENSIONALES
    // Como arrays de arrays en JS pero con tipos fijos.
    // -----------------------------------------------------------------
    alfred::print_lesson("Arrays multidimensionales",
        "Matriz fija. Util para embeddings pequenos.");

    // Simula una mini-matriz de embeddings (3 documentos, 4 dimensiones)
    std::array<std::array<float, 4>, 3> embeddings = {{
        {0.1f, 0.5f, 0.3f, 0.8f},
        {0.9f, 0.2f, 0.7f, 0.4f},
        {0.3f, 0.6f, 0.1f, 0.9f}
    }};

    std::cout << "  Embedding matrix (3x4):\n";
    for (size_t doc = 0; doc < embeddings.size(); ++doc) {
        std::cout << "    doc_" << doc << ": [";
        for (size_t dim = 0; dim < embeddings[doc].size(); ++dim) {
            if (dim > 0) std::cout << ", ";
            std::cout << embeddings[doc][dim];
        }
        std::cout << "]\n";
    }

    // -----------------------------------------------------------------
    // STRINGS COMO ARRAYS
    // std::string se comporta como un array de caracteres.
    // -----------------------------------------------------------------
    alfred::print_lesson("String como array",
        "Puedes acceder caracter por caracter, como en JS.");

    std::string texto = "Alfred";

    std::cout << "  texto[0] = '" << texto[0] << "'\n";
    std::cout << "  texto[5] = '" << texto[5] << "'\n";

    // Iterar caracteres
    std::cout << "  Caracteres: ";
    for (char c : texto) {
        std::cout << c << " ";
    }
    std::cout << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: En C++ los arrays tienen tamano fijo y tipo unico.\n";
    std::cout << "  Usa std::array para arrays fijos seguros.\n";
    std::cout << "  Para tamano dinamico, estudia std::vector en el modulo stl/.\n";
    alfred::print_separator();

    return 0;
}
