// ============================================================================
// smart_pointers.cpp - Smart Pointers en C++ moderno
// ============================================================================
// En JS el Garbage Collector libera memoria automaticamente.
// En C++ clasico (new/delete) tu lo haces manualmente -> memory leaks.
// Smart Pointers son la solucion: gestion automatica SIN garbage collector.
//
// Son el equivalente a tener un GC pero sin el overhead de runtime.
// La limpieza se determina en COMPILACION, no en runtime.
// ============================================================================

#include <iostream>
#include <string>
#include <memory>     // unique_ptr, shared_ptr, weak_ptr
#include <vector>
#include "utils.h"

class Modelo {
private:
    std::string nombre_;
    int parametros_;

public:
    Modelo(const std::string& nombre, int params)
        : nombre_(nombre), parametros_(params) {
        std::cout << "  [+] Modelo creado: " << nombre_ << "\n";
    }

    ~Modelo() {
        std::cout << "  [-] Modelo destruido: " << nombre_ << "\n";
    }

    std::string info() const {
        return nombre_ + " (" + std::to_string(parametros_) + "B)";
    }

    const std::string& nombre() const { return nombre_; }
};

int main() {
    alfred::print_separator("SMART POINTERS EN C++");

    // -----------------------------------------------------------------
    // unique_ptr: UN solo dueno (ownership exclusivo)
    // Cuando el dueno muere, el objeto se destruye automaticamente.
    // Es el smart pointer que usaras el 90% del tiempo.
    // -----------------------------------------------------------------
    alfred::print_lesson("unique_ptr (ownership exclusivo)",
        "Un solo dueno. Se libera automaticamente al salir de scope.");

    {
        std::cout << "\n  --- Scope inicio ---\n";

        // make_unique es la forma recomendada de crear unique_ptr
        std::unique_ptr<Modelo> gemma = std::make_unique<Modelo>("gemma2:9b", 9);

        // Usar el puntero: con -> (como puntero normal)
        std::cout << "  Info: " << gemma->info() << "\n";

        // Verificar si no es null
        if (gemma) {
            std::cout << "  gemma existe: si\n";
        }

        // NO se puede copiar (ownership exclusivo)
        // std::unique_ptr<Modelo> copia = gemma;  // ERROR de compilacion

        // PERO se puede MOVER (transferir ownership)
        std::unique_ptr<Modelo> nuevo_dueno = std::move(gemma);
        std::cout << "  Ownership transferido via std::move\n";
        std::cout << "  gemma ahora es null? " << (gemma == nullptr ? "Si" : "No") << "\n";
        std::cout << "  nuevo_dueno: " << nuevo_dueno->info() << "\n";

        std::cout << "  --- Scope fin ---\n";
        // nuevo_dueno se destruye aqui, y con el, el Modelo
    }

    // -----------------------------------------------------------------
    // unique_ptr en vectores (coleccion de objetos polimorficos)
    // -----------------------------------------------------------------
    alfred::print_lesson("unique_ptr en contenedores",
        "Vectores de unique_ptr para colecciones polimorficas.");

    {
        std::cout << "\n  --- Creando vector de modelos ---\n";

        std::vector<std::unique_ptr<Modelo>> modelos;
        modelos.push_back(std::make_unique<Modelo>("llama3:8b", 8));
        modelos.push_back(std::make_unique<Modelo>("mistral:7b", 7));
        modelos.push_back(std::make_unique<Modelo>("phi3:3b", 3));

        std::cout << "\n  Modelos cargados:\n";
        for (const auto& m : modelos) {
            std::cout << "    " << m->info() << "\n";
        }

        // Eliminar un elemento especifico
        std::cout << "\n  Eliminando mistral...\n";
        modelos.erase(modelos.begin() + 1);

        std::cout << "\n  Modelos restantes:\n";
        for (const auto& m : modelos) {
            std::cout << "    " << m->info() << "\n";
        }

        std::cout << "\n  --- Vector sera destruido ---\n";
    }

    // -----------------------------------------------------------------
    // shared_ptr: multiples duenos (ownership compartido)
    // Usa un contador de referencias.
    // El objeto se destruye cuando el ultimo shared_ptr muere.
    // -----------------------------------------------------------------
    alfred::print_lesson("shared_ptr (ownership compartido)",
        "Multiples duenos. Se destruye cuando el ultimo muere.");

    {
        std::cout << "\n";
        std::shared_ptr<Modelo> compartido = std::make_shared<Modelo>("gemma2:9b", 9);
        std::cout << "  Ref count: " << compartido.use_count() << "\n";

        {
            // Copiar shared_ptr incrementa el contador
            std::shared_ptr<Modelo> copia1 = compartido;
            std::cout << "  Ref count (despues de copia1): " << compartido.use_count() << "\n";

            std::shared_ptr<Modelo> copia2 = compartido;
            std::cout << "  Ref count (despues de copia2): " << compartido.use_count() << "\n";

            std::cout << "  --- copia1 y copia2 salen de scope ---\n";
        }

        // copia1 y copia2 murieron, pero compartido sigue vivo
        std::cout << "  Ref count (despues): " << compartido.use_count() << "\n";
        std::cout << "  Modelo sigue vivo: " << compartido->info() << "\n";

        std::cout << "  --- compartido sale de scope ---\n";
    }

    // -----------------------------------------------------------------
    // weak_ptr: observa sin poseer
    // No incrementa el ref count. Util para evitar ciclos.
    // -----------------------------------------------------------------
    alfred::print_lesson("weak_ptr (observador sin ownership)",
        "Observa un shared_ptr sin mantenerlo vivo.");

    {
        std::weak_ptr<Modelo> observador;

        {
            std::shared_ptr<Modelo> dueno = std::make_shared<Modelo>("phi3:3b", 3);
            observador = dueno;  // weak_ptr observa, no incrementa count

            std::cout << "  Ref count con weak: " << dueno.use_count() << " (weak no cuenta)\n";

            // Para usar weak_ptr, debes convertirlo a shared_ptr temporalmente
            if (auto temp = observador.lock()) {
                std::cout << "  Via weak_ptr: " << temp->info() << "\n";
                std::cout << "  Ref count temp: " << dueno.use_count() << "\n";
            }

            std::cout << "  --- dueno sale de scope ---\n";
        }

        // El objeto ya fue destruido
        if (observador.expired()) {
            std::cout << "  weak_ptr: el objeto ya no existe (expired)\n";
        }
    }

    // -----------------------------------------------------------------
    // CUANDO USAR CADA UNO
    // -----------------------------------------------------------------
    alfred::print_lesson("Guia de uso",
        "Resumen de cuando usar cada smart pointer.");

    std::cout << "\n  unique_ptr (90% de los casos):\n";
    std::cout << "    - Un solo dueno claro\n";
    std::cout << "    - Miembros de clases\n";
    std::cout << "    - Factory functions\n";
    std::cout << "    - Colecciones polimorficas\n";
    std::cout << "    -> En Alfred: LlmModel, DocumentParser\n";

    std::cout << "\n  shared_ptr (cuando necesitas compartir):\n";
    std::cout << "    - Multiples partes del codigo necesitan el mismo recurso\n";
    std::cout << "    - Caches compartidos\n";
    std::cout << "    - Observers/subscribers\n";
    std::cout << "    -> En Alfred: EmbeddingCache compartido entre threads\n";

    std::cout << "\n  weak_ptr (para romper ciclos):\n";
    std::cout << "    - Observar sin poseer\n";
    std::cout << "    - Caches que no impiden destruccion\n";
    std::cout << "    - Nodos de grafo con referencias circulares\n";

    std::cout << "\n  raw pointer (T*) en C++ moderno:\n";
    std::cout << "    - SOLO como observador no-owning\n";
    std::cout << "    - Nunca hacer new/delete manual\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Smart pointers = gestion automatica de memoria\n";
    std::cout << "  SIN garbage collector. La limpieza se determina en compilacion.\n";
    std::cout << "  unique_ptr para ownership exclusivo (90% de casos).\n";
    std::cout << "  shared_ptr cuando realmente necesitas compartir.\n";
    std::cout << "  NUNCA uses new/delete directo en C++ moderno.\n";
    alfred::print_separator();

    return 0;
}
