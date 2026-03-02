// ============================================================================
// class_templates.cpp - Templates de clases (generics)
// ============================================================================
// TypeScript: class Cache<K, V> { get(key: K): V | undefined; }
// C++:        template<typename K, typename V> class Cache { V* get(const K&); };
//
// Las class templates permiten crear estructuras de datos genericas.
// El compilador genera una clase diferente para cada combinacion de tipos.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <unordered_map>
#include <optional>      // C++17: similar a T | undefined en TypeScript
#include <functional>
#include "utils.h"

// -----------------------------------------------------------------
// RESULT<T, E> - Tipo que representa exito o error
// Similar a Promise resolve/reject pero sincronico y tipado
// -----------------------------------------------------------------
template<typename T, typename E>
class Result {
private:
    bool is_ok_;
    T value_;
    E error_;

public:
    // Constructores estaticos (factory methods)
    static Result ok(const T& value) {
        Result r;
        r.is_ok_ = true;
        r.value_ = value;
        return r;
    }

    static Result err(const E& error) {
        Result r;
        r.is_ok_ = false;
        r.error_ = error;
        return r;
    }

    bool is_ok() const { return is_ok_; }
    bool is_err() const { return !is_ok_; }

    const T& value() const { return value_; }
    const E& error() const { return error_; }

    // Encadenar operaciones (como .then() en Promises)
    template<typename U, typename Fn>
    Result<U, E> and_then(Fn fn) const {
        if (is_ok_) {
            return fn(value_);
        }
        return Result<U, E>::err(error_);
    }
};

// -----------------------------------------------------------------
// CACHE<K, V> - Cache generico con LRU simplificado
// Simula el EmbeddingCache de Alfred pero generico
// -----------------------------------------------------------------
template<typename K, typename V>
class Cache {
private:
    struct Entry {
        V value;
        int accesos;
    };

    std::unordered_map<K, Entry> datos_;
    size_t capacidad_;
    int hits_;
    int misses_;

public:
    explicit Cache(size_t capacidad)
        : capacidad_(capacidad), hits_(0), misses_(0) {}

    void put(const K& key, const V& value) {
        if (datos_.size() >= capacidad_ && datos_.find(key) == datos_.end()) {
            // Evictar entrada con menos accesos
            auto min_it = datos_.begin();
            for (auto it = datos_.begin(); it != datos_.end(); ++it) {
                if (it->second.accesos < min_it->second.accesos) {
                    min_it = it;
                }
            }
            datos_.erase(min_it);
        }
        datos_[key] = Entry{value, 0};
    }

    // std::optional: puede tener valor o estar vacio (como T | undefined)
    std::optional<V> get(const K& key) {
        auto it = datos_.find(key);
        if (it == datos_.end()) {
            ++misses_;
            return std::nullopt;  // Equivale a undefined en JS
        }
        ++hits_;
        it->second.accesos++;
        return it->second.value;
    }

    bool contains(const K& key) const {
        return datos_.find(key) != datos_.end();
    }

    size_t size() const { return datos_.size(); }

    double hit_rate() const {
        int total = hits_ + misses_;
        if (total == 0) return 0.0;
        return static_cast<double>(hits_) / static_cast<double>(total) * 100.0;
    }

    void stats() const {
        std::cout << "  Cache: size=" << datos_.size()
                  << "/" << capacidad_
                  << " hits=" << hits_
                  << " misses=" << misses_
                  << " rate=" << hit_rate() << "%\n";
    }
};

// -----------------------------------------------------------------
// PIPELINE<T> - Cadena de transformaciones (como pipe en RxJS)
// -----------------------------------------------------------------
template<typename T>
class Pipeline {
private:
    T valor_;

public:
    explicit Pipeline(const T& valor) : valor_(valor) {}

    // Encadenar transformacion (como .pipe() o .then())
    template<typename Fn>
    auto then(Fn fn) const -> Pipeline<decltype(fn(valor_))> {
        return Pipeline<decltype(fn(valor_))>(fn(valor_));
    }

    const T& value() const { return valor_; }
};

// Helper para crear pipeline (como pipe() en functional programming)
template<typename T>
Pipeline<T> pipeline(const T& valor) {
    return Pipeline<T>(valor);
}

int main() {
    alfred::print_separator("TEMPLATES DE CLASES");

    // -----------------------------------------------------------------
    // RESULT<T, E>
    // -----------------------------------------------------------------
    alfred::print_lesson("Result<T, E>",
        "Exito o error tipado. Como Promise pero sincronico.");

    auto cargar_modelo = [](const std::string& path) -> Result<std::string, std::string> {
        if (path.empty()) {
            return Result<std::string, std::string>::err("Ruta vacia");
        }
        if (path.find(".gguf") == std::string::npos) {
            return Result<std::string, std::string>::err("No es un archivo GGUF");
        }
        return Result<std::string, std::string>::ok("Modelo cargado: " + path);
    };

    auto r1 = cargar_modelo("models/gemma2.gguf");
    auto r2 = cargar_modelo("models/gemma2.bin");
    auto r3 = cargar_modelo("");

    std::cout << "  gemma2.gguf: " << (r1.is_ok() ? r1.value() : r1.error()) << "\n";
    std::cout << "  gemma2.bin:  " << (r2.is_ok() ? r2.value() : r2.error()) << "\n";
    std::cout << "  (vacio):     " << (r3.is_ok() ? r3.value() : r3.error()) << "\n";

    // -----------------------------------------------------------------
    // CACHE GENERICO
    // -----------------------------------------------------------------
    alfred::print_lesson("Cache<K, V> generico",
        "Un solo template, multiples usos.");

    // Cache de embeddings: string -> vector<float>
    std::cout << "\n  --- Cache de Embeddings ---\n";
    Cache<std::string, std::vector<float>> emb_cache(3);

    emb_cache.put("que es cuda", {0.1f, 0.5f, 0.3f});
    emb_cache.put("como funciona llama.cpp", {0.9f, 0.2f, 0.7f});
    emb_cache.put("que gpu necesito", {0.3f, 0.6f, 0.1f});

    auto resultado = emb_cache.get("que es cuda");
    if (resultado.has_value()) {
        std::cout << "  HIT: dimension = " << resultado->size() << "\n";
    }

    emb_cache.get("no existe");  // miss
    emb_cache.stats();

    // Cache de configuracion: string -> string
    std::cout << "\n  --- Cache de Config ---\n";
    Cache<std::string, std::string> config_cache(10);
    config_cache.put("model", "gemma2:9b");
    config_cache.put("temperature", "0.7");

    auto model = config_cache.get("model");
    if (model.has_value()) {
        std::cout << "  model = " << model.value() << "\n";
    }
    config_cache.stats();

    // Cache numerico: int -> double
    std::cout << "\n  --- Cache Numerico ---\n";
    Cache<int, double> score_cache(5);
    score_cache.put(1, 0.95);
    score_cache.put(2, 0.87);
    score_cache.put(3, 0.92);

    auto score = score_cache.get(2);
    if (score) {  // optional se evalua como bool
        std::cout << "  score[2] = " << *score << "\n";
    }
    score_cache.stats();

    // -----------------------------------------------------------------
    // PIPELINE
    // -----------------------------------------------------------------
    alfred::print_lesson("Pipeline<T> (encadenamiento funcional)",
        "Como .then() en Promises o .pipe() en RxJS.");

    auto result = pipeline(std::string("  hola mundo  "))
        .then([](const std::string& s) {
            // trim manual
            size_t start = s.find_first_not_of(' ');
            size_t end = s.find_last_not_of(' ');
            return s.substr(start, end - start + 1);
        })
        .then([](const std::string& s) {
            std::string upper = s;
            for (auto& c : upper) {
                c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
            }
            return upper;
        })
        .then([](const std::string& s) {
            return "[" + s + "]";
        });

    std::cout << "\n  Pipeline: \"  hola mundo  \" -> trim -> upper -> bracket\n";
    std::cout << "  Resultado: " << result.value() << "\n";

    // Pipeline numerico
    auto num_result = pipeline(42)
        .then([](int n) { return n * 2; })
        .then([](int n) { return n + 10; })
        .then([](int n) { return static_cast<double>(n) / 3.0; });

    std::cout << "\n  Pipeline: 42 -> *2 -> +10 -> /3.0\n";
    std::cout << "  Resultado: " << num_result.value() << "\n";

    // -----------------------------------------------------------------
    // std::optional (C++17)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::optional<T>",
        "Como T | undefined en TypeScript. Valor presente o ausente.");

    auto buscar_modelo = [](const std::string& nombre) -> std::optional<std::string> {
        if (nombre == "gemma2") return "models/gemma2-9b.gguf";
        if (nombre == "llama3") return "models/llama3-8b.gguf";
        return std::nullopt;  // No encontrado
    };

    auto path1 = buscar_modelo("gemma2");
    auto path2 = buscar_modelo("inexistente");

    std::cout << "\n  buscar('gemma2'):      "
              << path1.value_or("no encontrado") << "\n";
    std::cout << "  buscar('inexistente'): "
              << path2.value_or("no encontrado") << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Class templates = generics de TypeScript\n";
    std::cout << "  pero resueltos en compilacion con zero overhead.\n";
    std::cout << "  Usa std::optional para valores opcionales (no nullptr).\n";
    std::cout << "  Result<T,E> para errores (mejor que excepciones en hot paths).\n";
    std::cout << "  Para Alfred: Cache<K,V> para embeddings, Result para inferencia.\n";
    alfred::print_separator();

    return 0;
}
