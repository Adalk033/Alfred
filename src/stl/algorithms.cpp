// ============================================================================
// algorithms.cpp - Algoritmos de la STL
// ============================================================================
// JS: arr.map(), arr.filter(), arr.reduce(), arr.sort()
// C++: std::transform, std::copy_if, std::accumulate, std::sort
//
// La STL tiene ~100 algoritmos listos para usar. Operan con iteradores,
// lo que significa que funcionan con CUALQUIER contenedor.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <numeric>
#include <functional>
#include "utils.h"

int main() {
    alfred::print_separator("ALGORITMOS STL");

    std::vector<double> scores = {0.85, 0.42, 0.92, 0.78, 0.95, 0.31, 0.88, 0.67};

    // -----------------------------------------------------------------
    // SORT (arr.sort() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::sort",
        "Ordena in-place. O(n log n). Mucho mas rapido que JS sort.");

    std::vector<double> sorted_scores = scores;
    std::sort(sorted_scores.begin(), sorted_scores.end());
    std::cout << "  Ascendente: ";
    for (double s : sorted_scores) std::cout << s << " ";
    std::cout << "\n";

    std::sort(sorted_scores.begin(), sorted_scores.end(), std::greater<>{});
    std::cout << "  Descendente: ";
    for (double s : sorted_scores) std::cout << s << " ";
    std::cout << "\n";

    // -----------------------------------------------------------------
    // TRANSFORM (arr.map() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::transform -> arr.map()",
        "Transforma cada elemento y guarda resultado en otro contenedor.");

    std::vector<double> normalized;
    normalized.resize(scores.size());

    // Multiplicar cada score por 100
    std::transform(scores.begin(), scores.end(), normalized.begin(),
        [](double s) { return s * 100.0; });

    std::cout << "  Original:    ";
    for (double s : scores) std::cout << s << " ";
    std::cout << "\n  Normalizado: ";
    for (double n : normalized) std::cout << n << " ";
    std::cout << "\n";

    // -----------------------------------------------------------------
    // COPY_IF (arr.filter() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::copy_if -> arr.filter()",
        "Copia elementos que cumplen una condicion.");

    std::vector<double> altos;
    std::copy_if(scores.begin(), scores.end(), std::back_inserter(altos),
        [](double s) { return s >= 0.8; });

    std::cout << "  Scores >= 0.8: ";
    for (double s : altos) std::cout << s << " ";
    std::cout << " (count: " << altos.size() << ")\n";

    // -----------------------------------------------------------------
    // ACCUMULATE (arr.reduce() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::accumulate -> arr.reduce()",
        "Reduce un contenedor a un solo valor.");

    double suma = std::accumulate(scores.begin(), scores.end(), 0.0);
    double promedio = suma / static_cast<double>(scores.size());

    std::cout << "  Suma:     " << suma << "\n";
    std::cout << "  Promedio: " << promedio << "\n";

    // Reduce con operacion custom (como reduce con callback en JS)
    double producto = std::accumulate(scores.begin(), scores.end(), 1.0,
        [](double acc, double val) { return acc * val; });
    std::cout << "  Producto: " << producto << "\n";

    // -----------------------------------------------------------------
    // FIND / FIND_IF (arr.find() / arr.findIndex() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::find / find_if",
        "Busca el primer elemento que cumple condicion.");

    auto it = std::find(scores.begin(), scores.end(), 0.92);
    if (it != scores.end()) {
        auto idx = std::distance(scores.begin(), it);
        std::cout << "  find(0.92): posicion " << idx << "\n";
    }

    auto best = std::find_if(scores.begin(), scores.end(),
        [](double s) { return s > 0.9; });
    if (best != scores.end()) {
        std::cout << "  Primer score > 0.9: " << *best << "\n";
    }

    // -----------------------------------------------------------------
    // ANY_OF / ALL_OF / NONE_OF (arr.some() / arr.every() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("any_of / all_of / none_of",
        "Verifican condiciones sobre el contenedor.");

    bool alguno_alto = std::any_of(scores.begin(), scores.end(),
        [](double s) { return s > 0.9; });
    bool todos_positivos = std::all_of(scores.begin(), scores.end(),
        [](double s) { return s > 0.0; });
    bool ninguno_negativo = std::none_of(scores.begin(), scores.end(),
        [](double s) { return s < 0.0; });

    std::cout << "  any_of(> 0.9):  " << (alguno_alto ? "true" : "false") << "  (como .some())\n";
    std::cout << "  all_of(> 0.0):  " << (todos_positivos ? "true" : "false") << "  (como .every())\n";
    std::cout << "  none_of(< 0.0): " << (ninguno_negativo ? "true" : "false") << "\n";

    // -----------------------------------------------------------------
    // FOR_EACH (arr.forEach() en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::for_each -> arr.forEach()",
        "Ejecuta una funcion sobre cada elemento.");

    std::cout << "  Procesando scores: ";
    std::for_each(scores.begin(), scores.end(), [](double s) {
        char nivel = (s >= 0.8) ? '+' : '-';
        std::cout << "[" << nivel << s << "] ";
    });
    std::cout << "\n";

    // -----------------------------------------------------------------
    // MIN/MAX
    // -----------------------------------------------------------------
    alfred::print_lesson("min_element / max_element",
        "Encuentra el minimo y maximo de un rango.");

    auto [min_it, max_it] = std::minmax_element(scores.begin(), scores.end());
    std::cout << "  Min: " << *min_it << " en posicion "
              << std::distance(scores.begin(), min_it) << "\n";
    std::cout << "  Max: " << *max_it << " en posicion "
              << std::distance(scores.begin(), max_it) << "\n";

    // -----------------------------------------------------------------
    // REMOVE_IF + ERASE (patron erase-remove)
    // -----------------------------------------------------------------
    alfred::print_lesson("Erase-Remove idiom",
        "Patron para eliminar elementos que cumplen condicion.");

    std::vector<double> filtrado = scores;
    // remove_if mueve los eliminados al final, erase los borra
    filtrado.erase(
        std::remove_if(filtrado.begin(), filtrado.end(),
            [](double s) { return s < 0.5; }),
        filtrado.end()
    );

    std::cout << "  Despues de eliminar < 0.5: ";
    for (double s : filtrado) std::cout << s << " ";
    std::cout << " (size: " << filtrado.size() << ")\n";

    // -----------------------------------------------------------------
    // EQUIVALENCIAS JS -> C++
    // -----------------------------------------------------------------
    alfred::print_lesson("Tabla de equivalencias",
        "JS Array methods -> C++ STL algorithms.");

    std::cout << "\n  JS                    C++ STL\n";
    std::cout << "  --------------------  -------------------------\n";
    std::cout << "  arr.map(fn)           std::transform\n";
    std::cout << "  arr.filter(fn)        std::copy_if\n";
    std::cout << "  arr.reduce(fn, init)  std::accumulate\n";
    std::cout << "  arr.find(fn)          std::find / std::find_if\n";
    std::cout << "  arr.some(fn)          std::any_of\n";
    std::cout << "  arr.every(fn)         std::all_of\n";
    std::cout << "  arr.forEach(fn)       std::for_each\n";
    std::cout << "  arr.sort()            std::sort\n";
    std::cout << "  arr.includes(x)       std::find != end\n";
    std::cout << "  arr.indexOf(x)        std::distance + find\n";
    std::cout << "  arr.reverse()         std::reverse\n";
    std::cout << "  arr.fill(x)           std::fill\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: La STL tiene todo lo que JS tiene y mas.\n";
    std::cout << "  La diferencia: en C++ son funciones libres, no metodos.\n";
    std::cout << "  Operan con iteradores, funcionan con CUALQUIER contenedor.\n";
    std::cout << "  Y todo se resuelve en compilacion -> zero overhead.\n";
    alfred::print_separator();

    return 0;
}
