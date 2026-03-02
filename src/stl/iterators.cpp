// ============================================================================
// iterators.cpp - Iteradores en C++
// ============================================================================
// Los iteradores son el mecanismo universal para recorrer contenedores.
// En JS tienes for...of y Symbol.iterator.
// En C++ los iteradores son mas potentes: pueden avanzar, retroceder,
// saltar, y son la base de todos los algoritmos de la STL.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <list>
#include <algorithm>
#include "utils.h"

int main() {
    alfred::print_separator("ITERADORES EN C++");

    // -----------------------------------------------------------------
    // CONCEPTO BASICO
    // -----------------------------------------------------------------
    alfred::print_lesson("Que es un iterador?",
        "Un objeto que apunta a un elemento y puede avanzar al siguiente.");

    std::vector<std::string> modelos = {"gemma2", "llama3", "mistral", "phi3"};

    // begin() apunta al primer elemento, end() apunta DESPUES del ultimo
    // [begin ... end)  (end es exclusivo, como en JS slice)
    auto it = modelos.begin();
    std::cout << "  *begin() = " << *it << " (primer elemento)\n";
    ++it;
    std::cout << "  *next    = " << *it << " (segundo elemento)\n";

    // end() NO es el ultimo elemento, es DESPUES del ultimo
    auto last = modelos.end() - 1;
    std::cout << "  *(end-1) = " << *last << " (ultimo elemento)\n";

    // -----------------------------------------------------------------
    // ITERAR CON ITERADORES
    // -----------------------------------------------------------------
    alfred::print_lesson("Formas de iterar",
        "range-for es azucar para iteradores. A veces necesitas el iterador directo.");

    // Forma 1: range-based for (la mas comun, usa iteradores internamente)
    std::cout << "\n  Range-for (recomendada):\n    ";
    for (const auto& m : modelos) {
        std::cout << m << " ";
    }
    std::cout << "\n";

    // Forma 2: iterador explicito (cuando necesitas la posicion o modificar)
    std::cout << "  Iterador explicito:\n";
    for (auto iter = modelos.begin(); iter != modelos.end(); ++iter) {
        auto index = std::distance(modelos.begin(), iter);
        std::cout << "    [" << index << "] " << *iter << "\n";
    }

    // Forma 3: iterador reverso (de atras hacia adelante)
    std::cout << "  Reverso:\n    ";
    for (auto rit = modelos.rbegin(); rit != modelos.rend(); ++rit) {
        std::cout << *rit << " ";
    }
    std::cout << "\n";

    // -----------------------------------------------------------------
    // ITERADORES Y ALGORITMOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Iteradores con algoritmos STL",
        "Los algoritmos operan con pares de iteradores [begin, end).");

    std::vector<double> scores = {0.85, 0.92, 0.78, 0.95, 0.88, 0.71, 0.99};

    // find: busca un valor
    auto found = std::find(scores.begin(), scores.end(), 0.95);
    if (found != scores.end()) {
        std::cout << "\n  Encontrado 0.95 en posicion "
                  << std::distance(scores.begin(), found) << "\n";
    }

    // find_if: busca con condicion (como arr.find() en JS)
    auto high_score = std::find_if(scores.begin(), scores.end(),
        [](double s) { return s > 0.9; });

    if (high_score != scores.end()) {
        std::cout << "  Primer score > 0.9: " << *high_score
                  << " en posicion " << std::distance(scores.begin(), high_score) << "\n";
    }

    // count_if: cuenta elementos que cumplen condicion
    auto count = std::count_if(scores.begin(), scores.end(),
        [](double s) { return s >= 0.85; });
    std::cout << "  Scores >= 0.85: " << count << "\n";

    // sort: ordena in-place
    std::sort(scores.begin(), scores.end());
    std::cout << "  Ordenado: ";
    for (double s : scores) std::cout << s << " ";
    std::cout << "\n";

    // Operar en un RANGO (sub-seccion del vector)
    // Solo ordena los 3 primeros
    std::vector<int> datos = {50, 30, 10, 40, 20, 60};
    std::sort(datos.begin(), datos.begin() + 3);  // Solo primeros 3
    std::cout << "  Parcial sort (primeros 3): ";
    for (int d : datos) std::cout << d << " ";
    std::cout << "\n";

    // -----------------------------------------------------------------
    // MODIFICAR DURANTE ITERACION
    // -----------------------------------------------------------------
    alfred::print_lesson("Modificar durante iteracion",
        "CUIDADO: insertar/eliminar invalida iteradores.");

    std::vector<int> numeros = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

    // FORMA CORRECTA de eliminar durante iteracion
    // erase() retorna iterador al siguiente elemento valido
    std::cout << "\n  Eliminando pares de {1..10}:\n";
    for (auto iter = numeros.begin(); iter != numeros.end(); ) {
        if (*iter % 2 == 0) {
            iter = numeros.erase(iter);  // erase retorna siguiente iterador valido
        } else {
            ++iter;
        }
    }
    std::cout << "    Resultado: ";
    for (int n : numeros) std::cout << n << " ";
    std::cout << "\n";

    // -----------------------------------------------------------------
    // ITERADORES EN MAPS
    // -----------------------------------------------------------------
    alfred::print_lesson("Iteradores en maps",
        "Cada elemento es un pair<key, value>. Usa structured bindings.");

    std::map<std::string, double> model_perf = {
        {"gemma2", 42.5},
        {"llama3", 38.2},
        {"mistral", 45.1},
        {"phi3", 52.8}
    };

    // Iterador apunta a std::pair<const string, double>
    for (auto iter = model_perf.begin(); iter != model_perf.end(); ++iter) {
        std::cout << "    " << iter->first << " -> "
                  << iter->second << " tokens/s\n";
    }

    // Buscar y modificar via iterador
    auto mit = model_perf.find("gemma2");
    if (mit != model_perf.end()) {
        mit->second = 48.0;  // Modificar valor via iterador
        std::cout << "  gemma2 actualizado a: " << mit->second << " t/s\n";
    }

    alfred::print_separator();
    std::cout << "  Leccion clave: Los iteradores son la interfaz universal de la STL.\n";
    std::cout << "  Todos los algoritmos (sort, find, count, etc.) usan iteradores.\n";
    std::cout << "  [begin, end) es la convencion: end es EXCLUSIVO.\n";
    std::cout << "  Para el 90% de los casos, range-for con const auto& basta.\n";
    alfred::print_separator();

    return 0;
}
