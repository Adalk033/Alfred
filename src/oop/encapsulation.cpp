// ============================================================================
// encapsulation.cpp - Encapsulamiento en C++
// ============================================================================
// En JS puedes hacer: obj.cualquierCosa = valor; (todo es accesible)
// En C++ tu defines explicitamente que es publico, privado y protegido.
// Esto obliga a disenar APIs claras y previene uso incorrecto.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <stdexcept>
#include "utils.h"

// -----------------------------------------------------------------
// CLASE CON ENCAPSULAMIENTO REAL
// Simula un EmbeddingCache para Alfred
// -----------------------------------------------------------------

class EmbeddingCache {
private:
    // Estado interno: NADIE accede directamente
    struct CacheEntry {
        std::string texto;
        std::vector<float> embedding;
        int accesos;
    };

    std::vector<CacheEntry> entradas_;
    size_t capacidad_maxima_;
    int hits_;
    int misses_;

    // Metodo privado: logica interna que el usuario no necesita conocer
    int buscar_indice(const std::string& texto) const {
        for (size_t i = 0; i < entradas_.size(); ++i) {
            if (entradas_[i].texto == texto) {
                return static_cast<int>(i);
            }
        }
        return -1;
    }

    // Eviccion: elimina la entrada menos accedida
    void evictar_si_necesario() {
        if (entradas_.size() < capacidad_maxima_) return;

        size_t min_idx = 0;
        int min_accesos = entradas_[0].accesos;

        for (size_t i = 1; i < entradas_.size(); ++i) {
            if (entradas_[i].accesos < min_accesos) {
                min_accesos = entradas_[i].accesos;
                min_idx = i;
            }
        }

        std::cout << "    [Cache] Evictando: \"" << entradas_[min_idx].texto << "\"\n";
        entradas_.erase(entradas_.begin() + static_cast<long>(min_idx));
    }

public:
    // Constructor explicito: evita conversiones implicitas
    explicit EmbeddingCache(size_t capacidad)
        : capacidad_maxima_(capacidad)
        , hits_(0)
        , misses_(0)
    {
        entradas_.reserve(capacidad);
    }

    // -----------------------------------------------------------------
    // API PUBLICA: interfaz clara y segura
    // El usuario solo ve estos metodos. La implementacion puede cambiar
    // sin afectar el codigo que usa la clase.
    // -----------------------------------------------------------------

    void almacenar(const std::string& texto, const std::vector<float>& embedding) {
        // Validacion en la frontera publica
        if (texto.empty()) {
            throw std::invalid_argument("El texto no puede estar vacio");
        }
        if (embedding.empty()) {
            throw std::invalid_argument("El embedding no puede estar vacio");
        }

        int idx = buscar_indice(texto);
        if (idx >= 0) {
            // Ya existe, actualizar
            entradas_[static_cast<size_t>(idx)].embedding = embedding;
            return;
        }

        evictar_si_necesario();
        entradas_.push_back({texto, embedding, 0});
    }

    // Retorna puntero a embedding o nullptr si no existe
    const std::vector<float>* consultar(const std::string& texto) {
        int idx = buscar_indice(texto);
        if (idx < 0) {
            ++misses_;
            return nullptr;
        }

        ++hits_;
        entradas_[static_cast<size_t>(idx)].accesos++;
        return &entradas_[static_cast<size_t>(idx)].embedding;
    }

    // Getters const: exponen datos sin permitir modificacion
    size_t tamano() const { return entradas_.size(); }
    size_t capacidad() const { return capacidad_maxima_; }
    int total_hits() const { return hits_; }
    int total_misses() const { return misses_; }

    double hit_rate() const {
        int total = hits_ + misses_;
        if (total == 0) return 0.0;
        return static_cast<double>(hits_) / static_cast<double>(total) * 100.0;
    }

    void imprimir_stats() const {
        std::cout << "  Cache: " << entradas_.size() << "/" << capacidad_maxima_
                  << " | hits: " << hits_
                  << " | misses: " << misses_
                  << " | hit rate: " << hit_rate() << "%\n";
    }

    // -----------------------------------------------------------------
    // DELETE: prevenir copia accidental del cache
    // En JS copiar un objeto es trivial y a veces accidental.
    // En C++ puedes prohibirlo explicitamente.
    // -----------------------------------------------------------------
    EmbeddingCache(const EmbeddingCache&) = delete;
    EmbeddingCache& operator=(const EmbeddingCache&) = delete;

    // Pero SI permitir mover (transferir ownership)
    EmbeddingCache(EmbeddingCache&&) = default;
    EmbeddingCache& operator=(EmbeddingCache&&) = default;
};

int main() {
    alfred::print_separator("ENCAPSULAMIENTO EN C++");

    alfred::print_lesson("private / public / protected",
        "Control explicito de acceso. JS no tiene esto (hasta #fields).");

    std::cout << "\n  private:   Solo la clase accede (datos, logica interna)\n";
    std::cout << "  protected: La clase y sus hijas acceden\n";
    std::cout << "  public:    Todo el mundo accede (la API)\n";

    // -----------------------------------------------------------------
    // USO DEL CACHE ENCAPSULADO
    // -----------------------------------------------------------------
    alfred::print_lesson("EmbeddingCache en accion",
        "La implementacion interna esta oculta. Solo usamos la API publica.");

    EmbeddingCache cache(3); // Capacidad para 3 entradas

    // Simular embeddings (en produccion vendrian de CUDA)
    std::vector<float> emb1 = {0.1f, 0.5f, 0.3f, 0.8f};
    std::vector<float> emb2 = {0.9f, 0.2f, 0.7f, 0.4f};
    std::vector<float> emb3 = {0.3f, 0.6f, 0.1f, 0.9f};
    std::vector<float> emb4 = {0.5f, 0.5f, 0.5f, 0.5f};

    // Almacenar
    cache.almacenar("Que es CUDA?", emb1);
    cache.almacenar("Como funciona llama.cpp?", emb2);
    cache.almacenar("Que GPU necesito?", emb3);

    cache.imprimir_stats();

    // Consultar (hits)
    std::cout << "\n  Consultando...\n";
    auto* resultado1 = cache.consultar("Que es CUDA?");
    if (resultado1) {
        std::cout << "  HIT: 'Que es CUDA?' -> embedding dim=" << resultado1->size() << "\n";
    }

    auto* resultado2 = cache.consultar("Que es Python?");
    if (!resultado2) {
        std::cout << "  MISS: 'Que es Python?' -> no encontrado\n";
    }

    cache.consultar("Que es CUDA?");  // Otro hit
    cache.consultar("Que GPU necesito?"); // Hit

    cache.imprimir_stats();

    // Insertar uno mas (fuerza eviccion)
    std::cout << "\n  Insertando cuarto elemento (capacidad = 3)...\n";
    cache.almacenar("Que es TensorRT?", emb4);
    cache.imprimir_stats();

    // -----------------------------------------------------------------
    // INTENTAR ACCEDER A DATOS PRIVADOS => ERROR
    // -----------------------------------------------------------------
    alfred::print_lesson("Proteccion en compilacion",
        "Intentar acceder a miembros privados causa error de compilacion.");

    std::cout << "\n  // cache.entradas_          -> ERROR: private\n";
    std::cout << "  // cache.hits_ = 999        -> ERROR: private\n";
    std::cout << "  // cache.buscar_indice(\"x\") -> ERROR: private\n";
    std::cout << "  cache.tamano()              -> OK: " << cache.tamano() << "\n";
    std::cout << "  cache.hit_rate()            -> OK: " << cache.hit_rate() << "%\n";

    // -----------------------------------------------------------------
    // DELETE: No se puede copiar
    // -----------------------------------------------------------------
    alfred::print_lesson("Prevenir copia (= delete)",
        "Puedes prohibir operaciones que no tienen sentido.");

    std::cout << "\n  // EmbeddingCache copia = cache;  -> ERROR de compilacion\n";
    std::cout << "  // Copiar un cache de embeddings no tiene sentido,\n";
    std::cout << "  // duplicaria toda la memoria sin razon.\n";

    // Pero SI puedes mover (transferir ownership)
    std::cout << "\n  Moviendo cache a nuevo owner...\n";
    EmbeddingCache nuevo_owner = std::move(cache);
    nuevo_owner.imprimir_stats();

    // -----------------------------------------------------------------
    // VALIDACION EN LA FRONTERA
    // -----------------------------------------------------------------
    alfred::print_lesson("Validacion en constructores/metodos",
        "La clase protege sus invariantes. Datos invalidos no entran.");

    try {
        nuevo_owner.almacenar("", emb1); // Texto vacio
    } catch (const std::invalid_argument& e) {
        std::cout << "\n  Excepcion capturada: " << e.what() << "\n";
    }

    alfred::print_separator();
    std::cout << "  Leccion clave: El encapsulamiento en C++ es real, no decorativo.\n";
    std::cout << "  private/public son verificados por el COMPILADOR.\n";
    std::cout << "  = delete previene operaciones que no tienen sentido.\n";
    std::cout << "  Esto te obliga a disenar APIs limpias desde el inicio.\n";
    alfred::print_separator();

    return 0;
}
