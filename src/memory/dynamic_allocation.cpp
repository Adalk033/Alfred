// ============================================================================
// dynamic_allocation.cpp - Stack vs Heap en C++
// ============================================================================
// En JS toda la memoria es gestionada por el engine (V8).
// En C++ hay dos zonas de memoria:
//   STACK: rapida, automatica, tamano limitado (~1-8MB)
//   HEAP:  lenta, manual/smart, tamano = toda tu RAM
//
// Entender esto es FUNDAMENTAL para el rendimiento de Alfred.
// Los embeddings y modelos van en heap (son enormes).
// Las variables locales van en stack (rapidas).
// ============================================================================

#include <iostream>
#include <string>
#include <memory>
#include <vector>
#include <chrono>
#include "utils.h"

// Estructura que simula un buffer de embeddings
struct EmbeddingBuffer {
    std::string nombre;
    std::vector<float> datos;  // Internamente usa heap

    EmbeddingBuffer(const std::string& n, size_t dimension)
        : nombre(n), datos(dimension, 0.0f)
    {
        std::cout << "    [+] Buffer '" << nombre << "' creado ("
                  << dimension * sizeof(float) << " bytes)\n";
    }

    ~EmbeddingBuffer() {
        std::cout << "    [-] Buffer '" << nombre << "' destruido\n";
    }
};

int main() {
    alfred::print_separator("STACK vs HEAP - ASIGNACION DINAMICA");

    // -----------------------------------------------------------------
    // STACK: automatico, rapido, limitado
    // -----------------------------------------------------------------
    alfred::print_lesson("Stack (memoria automatica)",
        "Variables locales viven en el stack. Se liberan automaticamente.");

    {
        int a = 10;            // 4 bytes en stack
        double b = 3.14;       // 8 bytes en stack
        char c = 'X';          // 1 byte en stack

        std::cout << "  Variables en stack:\n";
        std::cout << "    int a     -> " << sizeof(a) << " bytes en direccion " << &a << "\n";
        std::cout << "    double b  -> " << sizeof(b) << " bytes en direccion " << &b << "\n";
        std::cout << "    char c    -> " << sizeof(c) << " bytes en direccion " << &c << "\n";

        // Nota: las direcciones del stack son decrecientes
        // (crece hacia abajo en la mayoria de arquitecturas)
    }
    // a, b, c ya no existen aqui

    // -----------------------------------------------------------------
    // HEAP: manual, flexible, toda la RAM disponible
    // -----------------------------------------------------------------
    alfred::print_lesson("Heap (memoria dinamica)",
        "new/delete asigna en heap. En C++ moderno usa smart pointers.");

    // FORMA ANTIGUA (new/delete) - NO USAR EN CODIGO NUEVO
    std::cout << "\n  Forma antigua (NO recomendada):\n";
    {
        int* ptr = new int(42);
        std::cout << "    new int(42) -> valor: " << *ptr
                  << " en direccion: " << ptr << "\n";
        delete ptr;  // Si olvidas esto: MEMORY LEAK
        ptr = nullptr;
        std::cout << "    delete ptr -> liberado\n";
    }

    // FORMA MODERNA (smart pointers) - SIEMPRE USAR ESTA
    std::cout << "\n  Forma moderna (recomendada):\n";
    {
        auto ptr = std::make_unique<int>(42);
        std::cout << "    make_unique<int>(42) -> valor: " << *ptr << "\n";
        // No necesitas delete, se libera solo al salir de scope
    }
    std::cout << "    (liberado automaticamente)\n";

    // -----------------------------------------------------------------
    // ARRAYS DINAMICOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Arrays en heap",
        "Para datos grandes (embeddings, modelos). Tamano en runtime.");

    // Forma antigua - NO USAR
    std::cout << "\n  Array antiguo (NO recomendado):\n";
    {
        int tamano = 5;
        int* arr = new int[tamano]{10, 20, 30, 40, 50};
        std::cout << "    arr = [";
        for (int i = 0; i < tamano; ++i) {
            if (i > 0) std::cout << ", ";
            std::cout << arr[i];
        }
        std::cout << "]\n";
        delete[] arr;  // delete[] para arrays, no delete
        std::cout << "    delete[] arr -> liberado\n";
    }

    // Forma moderna - std::vector (SIEMPRE USAR ESTA)
    std::cout << "\n  Vector moderno (recomendado):\n";
    {
        std::vector<int> vec = {10, 20, 30, 40, 50};
        // Internamente vector usa heap, pero gestiona la memoria automaticamente
        std::cout << "    vec = [";
        for (size_t i = 0; i < vec.size(); ++i) {
            if (i > 0) std::cout << ", ";
            std::cout << vec[i];
        }
        std::cout << "] (size:" << vec.size() << ", capacity:" << vec.capacity() << ")\n";

        vec.push_back(60);
        vec.push_back(70);
        std::cout << "    Despues de push_back x2: size:" << vec.size()
                  << ", capacity:" << vec.capacity() << "\n";
    }

    // -----------------------------------------------------------------
    // OBJETOS EN HEAP
    // -----------------------------------------------------------------
    alfred::print_lesson("Objetos en heap con unique_ptr",
        "Objetos grandes van en heap. Smart pointers gestionan la vida.");

    {
        std::cout << "\n  Creando buffers de embedding:\n";
        auto buffer_query = std::make_unique<EmbeddingBuffer>("query", 384);
        auto buffer_doc = std::make_unique<EmbeddingBuffer>("documento", 384);

        std::cout << "\n  Usando buffers:\n";
        std::cout << "    query dimension: " << buffer_query->datos.size() << "\n";
        std::cout << "    doc dimension:   " << buffer_doc->datos.size() << "\n";

        std::cout << "\n  Saliendo de scope...\n";
    }

    // -----------------------------------------------------------------
    // RENDIMIENTO: Stack vs Heap
    // -----------------------------------------------------------------
    alfred::print_lesson("Rendimiento: Stack vs Heap",
        "Stack es ~100x mas rapido que heap para asignacion.");

    const int ITERACIONES = 1000000;

    // Benchmark stack
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < ITERACIONES; ++i) {
        int valor = i;           // Stack allocation
        (void)valor;             // Evitar warning de variable no usada
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto stack_ns = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    // Benchmark heap
    start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < ITERACIONES; ++i) {
        auto ptr = std::make_unique<int>(i);  // Heap allocation
        (void)ptr;
    }
    end = std::chrono::high_resolution_clock::now();
    auto heap_ns = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

    std::cout << "\n  " << ITERACIONES << " asignaciones:\n";
    std::cout << "    Stack: " << stack_ns << " us\n";
    std::cout << "    Heap:  " << heap_ns << " us\n";
    if (heap_ns > 0 && stack_ns > 0) {
        std::cout << "    Heap es ~" << heap_ns / std::max(stack_ns, static_cast<long long>(1))
                  << "x mas lento\n";
    }

    // -----------------------------------------------------------------
    // GUIA PRACTICA PARA ALFRED
    // -----------------------------------------------------------------
    alfred::print_lesson("Donde poner cada cosa en Alfred",
        "Stack para lo pequeno/temporal, Heap para lo grande/persistente.");

    std::cout << "\n  STACK (automatico, rapido):\n";
    std::cout << "    - Variables locales\n";
    std::cout << "    - Parametros de funciones\n";
    std::cout << "    - Resultados temporales\n";
    std::cout << "    - Indices, contadores, flags\n";

    std::cout << "\n  HEAP (dinamico, grande):\n";
    std::cout << "    - Modelo LLM cargado (~4-8 GB)\n";
    std::cout << "    - Indices FAISS (~100MB-1GB)\n";
    std::cout << "    - Buffers de embedding (~MB)\n";
    std::cout << "    - Historial de conversaciones\n";
    std::cout << "    - Documentos cargados\n";
    std::cout << "    - Cualquier cosa cuyo tamano no conoces en compilacion\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Stack = rapido y automatico pero limitado.\n";
    std::cout << "  Heap = flexible pero necesita gestion (usa smart pointers).\n";
    std::cout << "  En JS todo va al heap y el GC limpia. En C++ tu decides.\n";
    std::cout << "  Regla: std::vector para arrays, unique_ptr para objetos.\n";
    std::cout << "  NUNCA usar new/delete directo en C++ moderno.\n";
    alfred::print_separator();

    return 0;
}
