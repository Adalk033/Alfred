// ============================================================================
// vectors.cpp - std::vector (el array dinamico de C++)
// ============================================================================
// JS: const arr = [];  arr.push(1);  -> Array dinamico, tipos mixtos
// C++: std::vector<int> vec; vec.push_back(1); -> Dinamico, UN tipo
//
// std::vector es el contenedor que mas usaras en C++.
// Es como Array de JS pero tipado, mas rapido, y sin garbage collector.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <numeric>
#include "utils.h"

int main() {
    alfred::print_separator("STD::VECTOR - ARRAY DINAMICO");

    // -----------------------------------------------------------------
    // CREACION
    // -----------------------------------------------------------------
    alfred::print_lesson("Crear vectores",
        "Multiples formas de inicializar, todas tipadas.");

    std::vector<int> vacio;                         // Vector vacio
    std::vector<int> con_valores = {1, 2, 3, 4, 5}; // Con valores iniciales
    std::vector<float> repetido(384, 0.0f);          // 384 elementos, todos 0.0
    std::vector<std::string> modelos = {"gemma2", "llama3", "mistral"};

    std::cout << "  vacio.size()      = " << vacio.size() << "\n";
    std::cout << "  con_valores.size() = " << con_valores.size() << "\n";
    std::cout << "  repetido.size()    = " << repetido.size() << " (dimension embedding)\n";
    std::cout << "  modelos.size()     = " << modelos.size() << "\n";

    // -----------------------------------------------------------------
    // AGREGAR ELEMENTOS
    // -----------------------------------------------------------------
    alfred::print_lesson("push_back / emplace_back",
        "push_back = como arr.push() en JS. emplace_back = mas eficiente.");

    modelos.push_back("phi3");              // Copia el string al vector
    modelos.emplace_back("codellama");      // Construye in-place (sin copia extra)

    std::cout << "  Despues de agregar:\n";
    for (const auto& m : modelos) {
        std::cout << "    - " << m << "\n";
    }

    // size vs capacity
    std::cout << "\n  size     = " << modelos.size() << " (elementos actuales)\n";
    std::cout << "  capacity = " << modelos.capacity() << " (espacio reservado)\n";
    // capacity >= size. El vector reserva mas espacio del necesario
    // para no tener que realocar en cada push_back.

    // -----------------------------------------------------------------
    // ACCESO
    // -----------------------------------------------------------------
    alfred::print_lesson("Acceso a elementos",
        "[] sin verificacion, .at() con verificacion de limites.");

    std::cout << "  modelos[0]   = " << modelos[0] << " (sin verificacion)\n";
    std::cout << "  modelos.at(1) = " << modelos.at(1) << " (con verificacion)\n";
    std::cout << "  front()      = " << modelos.front() << "\n";
    std::cout << "  back()       = " << modelos.back() << "\n";

    // .at() lanza excepcion si el indice es invalido
    try {
        std::cout << "  at(100)      = " << modelos.at(100) << "\n";
    } catch (const std::out_of_range& e) {
        std::cout << "  at(100)      = ERROR: " << e.what() << "\n";
    }

    // -----------------------------------------------------------------
    // MODIFICAR
    // -----------------------------------------------------------------
    alfred::print_lesson("Modificar elementos",
        "Acceso directo por indice o iterador.");

    modelos[0] = "gemma2:9b-Q4";
    std::cout << "  modelos[0] ahora = " << modelos[0] << "\n";

    // Insertar en posicion especifica
    modelos.insert(modelos.begin() + 2, "mixtral:8x7b");
    std::cout << "  Despues de insert en posicion 2:\n";
    for (size_t i = 0; i < modelos.size(); ++i) {
        std::cout << "    [" << i << "] " << modelos[i] << "\n";
    }

    // Eliminar
    modelos.erase(modelos.begin() + 2); // Elimina mixtral
    std::cout << "  Despues de erase posicion 2: size = " << modelos.size() << "\n";

    // pop_back (como arr.pop() en JS)
    modelos.pop_back();
    std::cout << "  Despues de pop_back: size = " << modelos.size() << "\n";

    // -----------------------------------------------------------------
    // RESERVE Y RESIZE
    // -----------------------------------------------------------------
    alfred::print_lesson("reserve vs resize",
        "reserve = espacio sin crear elementos. resize = crea elementos.");

    std::vector<float> embeddings;
    embeddings.reserve(384);  // Reserva espacio para 384, pero size sigue en 0
    std::cout << "  Despues de reserve(384): size=" << embeddings.size()
              << " capacity=" << embeddings.capacity() << "\n";

    embeddings.resize(384, 0.0f);  // Ahora SI crea 384 elementos con valor 0.0
    std::cout << "  Despues de resize(384):  size=" << embeddings.size()
              << " capacity=" << embeddings.capacity() << "\n";

    // -----------------------------------------------------------------
    // OPERACIONES UTILES
    // -----------------------------------------------------------------
    alfred::print_lesson("Operaciones comunes",
        "Equivalentes a metodos de Array en JS.");

    std::vector<double> scores = {0.85, 0.92, 0.78, 0.95, 0.88, 0.71};

    // empty() -> como arr.length === 0
    std::cout << "  empty? " << (scores.empty() ? "si" : "no") << "\n";

    // Ordenar (no existe arr.sort() integrado en vector, se usa algorithm)
    std::sort(scores.begin(), scores.end(), std::greater<double>{});
    std::cout << "  Ordenado (desc): ";
    for (double s : scores) std::cout << s << " ";
    std::cout << "\n";

    // Encontrar (como arr.find())
    auto it = std::find(scores.begin(), scores.end(), 0.92);
    if (it != scores.end()) {
        std::cout << "  Encontrado 0.92 en posicion: "
                  << std::distance(scores.begin(), it) << "\n";
    }

    // Sumar todos (como arr.reduce())
    double suma = std::accumulate(scores.begin(), scores.end(), 0.0);
    std::cout << "  Suma total: " << suma << "\n";
    std::cout << "  Promedio:   " << suma / static_cast<double>(scores.size()) << "\n";

    // Min y max
    auto [min_it, max_it] = std::minmax_element(scores.begin(), scores.end());
    std::cout << "  Min: " << *min_it << " | Max: " << *max_it << "\n";

    // Clear
    scores.clear();
    std::cout << "  Despues de clear: size=" << scores.size()
              << " capacity=" << scores.capacity() << " (capacidad se mantiene)\n";

    // Liberar memoria realmente
    scores.shrink_to_fit();
    std::cout << "  Despues de shrink_to_fit: capacity=" << scores.capacity() << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: std::vector es TU contenedor por defecto en C++.\n";
    std::cout << "  Usa reserve() si sabes el tamano de antemano (evita realocaciones).\n";
    std::cout << "  Usa const auto& en loops para evitar copias.\n";
    std::cout << "  Para Alfred: embeddings, chunks, historial = todo vectors.\n";
    alfred::print_separator();

    return 0;
}
