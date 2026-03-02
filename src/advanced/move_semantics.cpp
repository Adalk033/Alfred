// ============================================================================
// move_semantics.cpp - Move semantics (C++11)
// ============================================================================
// En JS: los objetos se pasan por referencia, el GC limpia.
// En C++: copiar objetos grandes es COSTOSO. Move semantics permite
// TRANSFERIR el contenido de un objeto a otro sin copiarlo.
//
// Imagina que tienes una caja con 1 millon de libros.
// COPIAR = comprar otra caja y fotocopiar cada libro (lento).
// MOVER = cambiar la etiqueta de la caja al nuevo dueno (instantaneo).
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <utility>
#include "utils.h"

class DocumentBuffer {
private:
    std::string nombre_;
    std::vector<float> datos_;    // Potencialmente enorme
    size_t operaciones_copia_;
    size_t operaciones_move_;

public:
    // Constructor normal
    DocumentBuffer(const std::string& nombre, size_t tamano)
        : nombre_(nombre)
        , datos_(tamano, 0.0f)
        , operaciones_copia_(0)
        , operaciones_move_(0)
    {
        // Llenar con datos simulados
        for (size_t i = 0; i < tamano; ++i) {
            datos_[i] = static_cast<float>(i) * 0.001f;
        }
    }

    // COPY CONSTRUCTOR: crea una copia completa (costoso)
    DocumentBuffer(const DocumentBuffer& other)
        : nombre_(other.nombre_ + " (copia)")
        , datos_(other.datos_)  // Copia todos los floats
        , operaciones_copia_(other.operaciones_copia_ + 1)
        , operaciones_move_(other.operaciones_move_)
    {
        std::cout << "    [COPY] Copiados " << datos_.size() << " floats ("
                  << datos_.size() * sizeof(float) << " bytes)\n";
    }

    // MOVE CONSTRUCTOR: transfiere ownership (barato)
    DocumentBuffer(DocumentBuffer&& other) noexcept
        : nombre_(std::move(other.nombre_))
        , datos_(std::move(other.datos_))  // Transfiere el puntero interno
        , operaciones_copia_(other.operaciones_copia_)
        , operaciones_move_(other.operaciones_move_ + 1)
    {
        std::cout << "    [MOVE] Transferido (zero copy)\n";
        // other queda en estado valido pero vacio
    }

    // COPY ASSIGNMENT
    DocumentBuffer& operator=(const DocumentBuffer& other) {
        if (this != &other) {
            nombre_ = other.nombre_ + " (asignado)";
            datos_ = other.datos_;
            operaciones_copia_ = other.operaciones_copia_ + 1;
            operaciones_move_ = other.operaciones_move_;
            std::cout << "    [COPY=] Copiados " << datos_.size() << " floats\n";
        }
        return *this;
    }

    // MOVE ASSIGNMENT
    DocumentBuffer& operator=(DocumentBuffer&& other) noexcept {
        if (this != &other) {
            nombre_ = std::move(other.nombre_);
            datos_ = std::move(other.datos_);
            operaciones_copia_ = other.operaciones_copia_;
            operaciones_move_ = other.operaciones_move_ + 1;
            std::cout << "    [MOVE=] Transferido (zero copy)\n";
        }
        return *this;
    }

    void info() const {
        std::cout << "  " << nombre_ << ": size=" << datos_.size()
                  << " copies=" << operaciones_copia_
                  << " moves=" << operaciones_move_ << "\n";
    }

    size_t size() const { return datos_.size(); }
    bool empty() const { return datos_.empty(); }
};

// Funcion que retorna un buffer (el compilador usa move automaticamente)
DocumentBuffer crear_buffer(const std::string& nombre, size_t tamano) {
    DocumentBuffer buf(nombre, tamano);
    return buf;  // Return Value Optimization (RVO) o move
}

int main() {
    alfred::print_separator("MOVE SEMANTICS");

    // -----------------------------------------------------------------
    // COPY vs MOVE
    // -----------------------------------------------------------------
    alfred::print_lesson("Copy vs Move",
        "Copy duplica datos. Move transfiere ownership sin copiar.");

    std::cout << "\n  Creando buffer de 100,000 floats...\n";
    DocumentBuffer original("original", 100000);
    original.info();

    std::cout << "\n  --- Copiando (lento) ---\n";
    DocumentBuffer copia = original;  // Llama al copy constructor
    copia.info();

    std::cout << "\n  --- Moviendo (instantaneo) ---\n";
    DocumentBuffer movido = std::move(original);  // Llama al move constructor
    movido.info();

    std::cout << "\n  Original despues de move:\n";
    std::cout << "  size = " << original.size() << " (vacio, ownership transferido)\n";

    // -----------------------------------------------------------------
    // BENCHMARK: Copy vs Move
    // -----------------------------------------------------------------
    alfred::print_lesson("Benchmark Copy vs Move",
        "Diferencia de rendimiento real con datos grandes.");

    const size_t TAMANO = 1000000;  // 1 millon de floats (~4MB)
    const int ITERACIONES = 100;

    // Benchmark copia
    std::cout << "\n  Copiando " << ITERACIONES << " veces (" << TAMANO << " floats)...\n";
    DocumentBuffer fuente("fuente", TAMANO);

    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < ITERACIONES; ++i) {
        DocumentBuffer copia_temp = fuente;  // COPY
        (void)copia_temp;
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto copy_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    // Benchmark move
    std::cout << "\n  Moviendo " << ITERACIONES << " veces...\n";
    std::vector<DocumentBuffer> destinos;
    destinos.reserve(ITERACIONES);

    start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < ITERACIONES; ++i) {
        DocumentBuffer temp("temp", TAMANO);
        destinos.push_back(std::move(temp));  // MOVE
    }
    end = std::chrono::high_resolution_clock::now();
    auto move_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    std::cout << "\n  Resultados:\n";
    std::cout << "    Copy: " << copy_ms << " ms\n";
    std::cout << "    Move: " << move_ms << " ms (incluye creacion)\n";

    // -----------------------------------------------------------------
    // CUANDO EL COMPILADOR USA MOVE AUTOMATICAMENTE
    // -----------------------------------------------------------------
    alfred::print_lesson("Move automatico",
        "El compilador mueve automaticamente en ciertos casos.");

    std::cout << "\n  1. Return de funciones (RVO/NRVO):\n";
    auto buffer = crear_buffer("auto_moved", 1000);
    buffer.info();

    std::cout << "\n  2. push_back con temporales:\n";
    std::vector<DocumentBuffer> vec;
    vec.reserve(3);
    vec.push_back(DocumentBuffer("temp1", 100));  // Move automatico (temporal)
    vec.push_back(DocumentBuffer("temp2", 100));  // Move automatico (temporal)

    std::cout << "\n  3. emplace_back (construye in-place, sin copy ni move):\n";
    vec.emplace_back("emplaced", 100);  // Construye directamente en el vector

    // -----------------------------------------------------------------
    // std::move NO mueve nada
    // -----------------------------------------------------------------
    alfred::print_lesson("std::move es un cast, no una operacion",
        "std::move solo dice 'puedes mover esto'. No mueve nada por si solo.");

    std::cout << "\n  std::move(x) convierte x en una 'rvalue reference' (&&).\n";
    std::cout << "  Esto le dice al compilador: 'ya no necesito x, puedes robar su contenido'.\n";
    std::cout << "  El move real ocurre en el constructor/asignacion que recibe el &&.\n";

    std::string texto = "Hola Alfred";
    std::cout << "\n  Antes: texto = \"" << texto << "\"\n";
    std::string otro = std::move(texto);  // Transfiere el contenido
    std::cout << "  Despues de move: texto = \"" << texto << "\" (posiblemente vacio)\n";
    std::cout << "  otro = \"" << otro << "\" (tiene el contenido)\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Move semantics evita copias innecesarias.\n";
    std::cout << "  En JS el GC maneja esto. En C++ TU optimizas con move.\n";
    std::cout << "  Regla: si ya no necesitas un objeto, usa std::move().\n";
    std::cout << "  El compilador mueve automaticamente temporales y returns.\n";
    std::cout << "  Para Alfred: mover buffers de embeddings, no copiarlos.\n";
    alfred::print_separator();

    return 0;
}
