// ============================================================================
// maps.cpp - std::map y std::unordered_map
// ============================================================================
// JS: const obj = {}; obj["key"] = value;  -> objeto como diccionario
// C++: std::map<string, int> m; m["key"] = value; -> arbol ordenado
//      std::unordered_map<string, int> m;         -> hash table (como JS)
//
// En JS los objetos son hash tables. En C++ tienes dos opciones:
//   map: ordenado (arbol rojo-negro), O(log n) busqueda
//   unordered_map: hash table, O(1) busqueda promedio (como JS)
// ============================================================================

#include <iostream>
#include <string>
#include <map>
#include <unordered_map>
#include <vector>
#include "utils.h"

int main() {
    alfred::print_separator("MAPS - DICCIONARIOS EN C++");

    // -----------------------------------------------------------------
    // std::unordered_map (equivalente a objetos/Map de JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("unordered_map (hash table)",
        "Como Object o Map de JS. Busqueda O(1). Sin orden.");

    std::unordered_map<std::string, int> word_count;

    // Insertar (como obj["key"] = value en JS)
    word_count["hola"] = 5;
    word_count["mundo"] = 3;
    word_count["alfred"] = 10;
    word_count.insert({"cuda", 7});

    // Acceder
    std::cout << "  word_count[\"alfred\"] = " << word_count["alfred"] << "\n";
    std::cout << "  size = " << word_count.size() << "\n";

    // CUIDADO: [] crea el elemento si no existe (como JS)
    std::cout << "  word_count[\"inexistente\"] = " << word_count["inexistente"]
              << " (se creo con valor 0!)\n";
    std::cout << "  size ahora = " << word_count.size() << "\n";

    // Verificar existencia ANTES de acceder (equivalente a "key" in obj)
    if (word_count.count("cuda") > 0) {
        std::cout << "  'cuda' existe: " << word_count["cuda"] << "\n";
    }

    // C++17: find retorna iterador
    if (auto it = word_count.find("alfred"); it != word_count.end()) {
        std::cout << "  Encontrado: " << it->first << " = " << it->second << "\n";
    }

    // Iterar (como Object.entries() en JS)
    std::cout << "\n  Contenido (sin orden garantizado):\n";
    for (const auto& [key, value] : word_count) {
        // Structured bindings (C++17) - como destructuring en JS
        std::cout << "    " << key << " -> " << value << "\n";
    }

    // Eliminar
    word_count.erase("inexistente");
    std::cout << "\n  Despues de erase: size = " << word_count.size() << "\n";

    // -----------------------------------------------------------------
    // std::map (arbol ordenado por clave)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::map (arbol ordenado)",
        "Como Map de JS pero siempre ordenado por clave. O(log n).");

    std::map<std::string, double> model_scores;
    model_scores["gemma2:9b"]    = 0.92;
    model_scores["llama3:8b"]    = 0.89;
    model_scores["mistral:7b"]   = 0.87;
    model_scores["phi3:3b"]      = 0.78;

    // Siempre itera en orden alfabetico de claves
    std::cout << "\n  Modelos ordenados por nombre:\n";
    for (const auto& [modelo, score] : model_scores) {
        std::cout << "    " << modelo << " -> " << score << "\n";
    }

    // -----------------------------------------------------------------
    // CASO PRACTICO: Stopwords para Alfred
    // -----------------------------------------------------------------
    alfred::print_lesson("Caso practico: Stopwords",
        "Set de palabras a ignorar en busqueda. O(1) lookup.");

    // unordered_map como set de busqueda rapida
    std::unordered_map<std::string, bool> stopwords;
    std::vector<std::string> palabras_stop = {
        "de", "la", "el", "en", "y", "a", "los", "las",
        "un", "una", "es", "que", "por", "con", "para"
    };

    for (const auto& palabra : palabras_stop) {
        stopwords[palabra] = true;
    }

    // Filtrar query
    std::vector<std::string> query_tokens = {
        "que", "es", "la", "programacion", "en", "cuda"
    };

    std::cout << "\n  Query original: ";
    for (const auto& t : query_tokens) std::cout << t << " ";
    std::cout << "\n";

    std::cout << "  Query filtrada: ";
    for (const auto& token : query_tokens) {
        if (stopwords.find(token) == stopwords.end()) {
            std::cout << token << " ";
        }
    }
    std::cout << "\n";

    // -----------------------------------------------------------------
    // CASO PRACTICO: Historial de conversacion
    // -----------------------------------------------------------------
    alfred::print_lesson("Caso practico: Config",
        "Map para configuracion tipada del modelo.");

    std::unordered_map<std::string, std::string> config;
    config["model_name"] = "gemma2:9b";
    config["model_path"] = "models/gemma2-9b.gguf";
    config["temperature"] = "0.7";
    config["max_tokens"]  = "4096";
    config["gpu_layers"]  = "-1";

    std::cout << "\n  Configuracion de Alfred:\n";
    for (const auto& [key, value] : config) {
        std::cout << "    " << key << " = " << value << "\n";
    }

    // Acceso seguro con valor por defecto
    auto get_config = [&config](const std::string& key,
                                const std::string& default_val) -> std::string {
        auto it = config.find(key);
        return (it != config.end()) ? it->second : default_val;
    };

    std::cout << "\n  gpu_layers = " << get_config("gpu_layers", "0") << "\n";
    std::cout << "  no_existe  = " << get_config("no_existe", "valor_por_defecto") << "\n";

    // -----------------------------------------------------------------
    // MAP vs UNORDERED_MAP
    // -----------------------------------------------------------------
    alfred::print_lesson("Cuando usar cual",
        "unordered_map para velocidad, map para orden.");

    std::cout << "\n  unordered_map:\n";
    std::cout << "    - Busqueda O(1) promedio\n";
    std::cout << "    - Sin orden garantizado\n";
    std::cout << "    - Usa hash table internamente\n";
    std::cout << "    -> Para: caches, lookups, stopwords, config\n";

    std::cout << "\n  map:\n";
    std::cout << "    - Busqueda O(log n)\n";
    std::cout << "    - Siempre ordenado por clave\n";
    std::cout << "    - Usa arbol rojo-negro\n";
    std::cout << "    -> Para: datos que necesitan orden, rangos\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: unordered_map es el equivalente a Object/Map de JS.\n";
    std::cout << "  Usa unordered_map para lookups rapidos (90% de los casos).\n";
    std::cout << "  Usa map solo cuando NECESITAS orden por clave.\n";
    std::cout << "  Siempre verifica existencia con find() antes de acceder.\n";
    alfred::print_separator();

    return 0;
}
