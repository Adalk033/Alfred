// ============================================================================
// concurrency.cpp - Programacion concurrente en C++
// ============================================================================
// JS: async/await, Promises, setTimeout (single-threaded, event loop)
// C++: std::thread, std::mutex, std::async (MULTI-threaded real)
//
// Diferencia fundamental:
// - JS tiene un solo hilo + event loop (concurrencia cooperativa)
// - C++ tiene hilos reales del SO (paralelismo verdadero)
// Para Alfred esto es clave: podemos procesar documentos en paralelo
// mientras el modelo genera respuestas en otro hilo.
// ============================================================================

#include <iostream>
#include <thread>
#include <mutex>
#include <future>
#include <vector>
#include <string>
#include <chrono>
#include <numeric>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include "utils.h"

// Mutex global para imprimir sin mezclar salida
std::mutex cout_mutex;

// Funcion auxiliar para simular trabajo
void simular_trabajo(const std::string& tarea, int ms) {
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
    std::lock_guard<std::mutex> lock(cout_mutex);
    std::cout << "  [Hilo " << std::this_thread::get_id()
              << "] " << tarea << " completado (" << ms << "ms)\n";
}

int main() {
    alfred::print_separator("CONCURRENCIA EN C++");

    // -----------------------------------------------------------------
    // INFORMACION DEL SISTEMA
    // -----------------------------------------------------------------
    std::cout << "  Hilos de hardware disponibles: "
              << std::thread::hardware_concurrency() << "\n";
    std::cout << "  Hilo principal: " << std::this_thread::get_id() << "\n\n";

    // -----------------------------------------------------------------
    // std::thread BASICO
    // -----------------------------------------------------------------
    alfred::print_lesson("std::thread basico",
        "Crea un hilo del SO. Debe hacer join() o detach().");

    // JS: No existe equivalente directo (Workers son procesos separados)
    {
        std::thread t1(simular_trabajo, "Cargar modelo", 100);
        std::thread t2(simular_trabajo, "Indexar documentos", 150);
        std::thread t3(simular_trabajo, "Iniciar GPU", 80);

        // join() = esperar a que termine (OBLIGATORIO antes de destruir)
        t1.join();
        t2.join();
        t3.join();
        std::cout << "  Todos los hilos terminaron.\n";
    }

    // -----------------------------------------------------------------
    // MUTEX (exclusion mutua)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::mutex - Evitar data races",
        "Un mutex asegura que solo un hilo accede a datos compartidos.");

    {
        // SIN mutex: data race! Resultado impredecible.
        // CON mutex: resultado correcto.
        int contador = 0;
        std::mutex mtx;

        auto incrementar = [&contador, &mtx](int veces) {
            for (int i = 0; i < veces; ++i) {
                // lock_guard es RAII: bloquea al crear, desbloquea al destruir
                std::lock_guard<std::mutex> lock(mtx);
                ++contador;
            }
        };

        std::vector<std::thread> hilos;
        for (int i = 0; i < 4; ++i) {
            hilos.emplace_back(incrementar, 10000);
        }
        for (auto& h : hilos) h.join();

        std::cout << "\n  Contador con mutex (esperado 40000): " << contador << "\n";
    }

    // -----------------------------------------------------------------
    // std::atomic - Operaciones atomicas
    // -----------------------------------------------------------------
    alfred::print_lesson("std::atomic",
        "Operaciones atomicas sin mutex. Mas rapido para contadores simples.");

    {
        std::atomic<int> contador{0};

        auto incrementar = [&contador](int veces) {
            for (int i = 0; i < veces; ++i) {
                ++contador;  // Operacion atomica, sin mutex
            }
        };

        std::vector<std::thread> hilos;
        for (int i = 0; i < 4; ++i) {
            hilos.emplace_back(incrementar, 10000);
        }
        for (auto& h : hilos) h.join();

        std::cout << "\n  Contador atomic (esperado 40000): " << contador.load() << "\n";
    }

    // -----------------------------------------------------------------
    // std::async y std::future (como async/await en JS)
    // -----------------------------------------------------------------
    alfred::print_lesson("std::async + std::future",
        "Lo mas parecido a async/await de JS. Lanza tarea y obtiene resultado.");

    {
        // JS:
        // const resultado = await procesarDocumento("doc.pdf");
        //
        // C++:
        // auto futuro = std::async(procesarDocumento, "doc.pdf");
        // auto resultado = futuro.get();  // Espera como await

        auto generar_embedding = [](const std::string& texto) -> std::vector<float> {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            // Simular embedding (en Alfred real seria el modelo)
            std::vector<float> emb(384, 0.0f);
            for (size_t i = 0; i < texto.size() && i < 384; ++i) {
                emb[i] = static_cast<float>(texto[i]) / 255.0f;
            }
            return emb;
        };

        auto calcular_similitud = [](const std::vector<float>& a,
                                      const std::vector<float>& b) -> double {
            std::this_thread::sleep_for(std::chrono::milliseconds(30));
            double dot = 0.0, norm_a = 0.0, norm_b = 0.0;
            for (size_t i = 0; i < a.size(); ++i) {
                dot += a[i] * b[i];
                norm_a += a[i] * a[i];
                norm_b += b[i] * b[i];
            }
            if (norm_a == 0.0 || norm_b == 0.0) return 0.0;
            return dot / (std::sqrt(norm_a) * std::sqrt(norm_b));
        };

        auto inicio = std::chrono::high_resolution_clock::now();

        // Lanzar tareas en paralelo (como Promise.all en JS)
        auto fut1 = std::async(std::launch::async, generar_embedding, "Que es CUDA?");
        auto fut2 = std::async(std::launch::async, generar_embedding, "Programacion GPU");
        auto fut3 = std::async(std::launch::async, generar_embedding, "Receta de cocina");

        // .get() espera el resultado (como await)
        auto emb1 = fut1.get();
        auto emb2 = fut2.get();
        auto emb3 = fut3.get();

        // Calcular similitudes en paralelo
        auto sim_fut1 = std::async(std::launch::async, calcular_similitud, emb1, emb2);
        auto sim_fut2 = std::async(std::launch::async, calcular_similitud, emb1, emb3);

        double sim1 = sim_fut1.get();
        double sim2 = sim_fut2.get();

        auto fin = std::chrono::high_resolution_clock::now();
        auto duracion = std::chrono::duration_cast<std::chrono::milliseconds>(fin - inicio);

        std::cout << "\n  3 embeddings + 2 similitudes en " << duracion.count() << "ms\n";
        std::cout << "  Similitud 'CUDA' vs 'GPU': " << sim1 << "\n";
        std::cout << "  Similitud 'CUDA' vs 'Cocina': " << sim2 << "\n";
    }

    // -----------------------------------------------------------------
    // PRODUCER-CONSUMER CON condition_variable
    // -----------------------------------------------------------------
    alfred::print_lesson("Patron Producer-Consumer",
        "Un hilo produce datos, otro los consume. Comun en pipelines.");

    {
        // JS: Streams (readable.pipe(writable))
        // C++: condition_variable para sincronizar
        std::mutex mtx;
        std::condition_variable cv;
        std::vector<std::string> cola;
        bool terminado = false;

        // Producer: simula cargar documentos
        auto producer = [&]() {
            std::vector<std::string> docs = {"doc1.pdf", "doc2.txt", "doc3.md"};
            for (const auto& doc : docs) {
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
                {
                    std::lock_guard<std::mutex> lock(mtx);
                    cola.push_back(doc);
                }
                cv.notify_one();  // Avisar al consumer
            }
            {
                std::lock_guard<std::mutex> lock(mtx);
                terminado = true;
            }
            cv.notify_one();
        };

        // Consumer: simula procesamiento
        int procesados = 0;
        auto consumer = [&]() {
            while (true) {
                std::unique_lock<std::mutex> lock(mtx);
                cv.wait(lock, [&]{ return !cola.empty() || terminado; });

                while (!cola.empty()) {
                    std::string doc = cola.back();
                    cola.pop_back();
                    lock.unlock();

                    // Procesar fuera del lock
                    std::lock_guard<std::mutex> cout_lock(cout_mutex);
                    std::cout << "  Procesado: " << doc << "\n";
                    ++procesados;

                    lock.lock();
                }

                if (terminado && cola.empty()) break;
            }
        };

        std::thread prod(producer);
        std::thread cons(consumer);
        prod.join();
        cons.join();
        std::cout << "  Total procesados: " << procesados << "\n";
    }

    alfred::print_separator();
    std::cout << "  Leccion clave: C++ tiene paralelismo REAL, no event loop.\n";
    std::cout << "  std::thread = hilo del SO. std::mutex = proteger datos.\n";
    std::cout << "  std::async/future = patron mas seguro (como async/await).\n";
    std::cout << "  std::atomic = contadores sin mutex.\n";
    std::cout << "  Para Alfred: procesar documentos, embeddings, e inferencia\n";
    std::cout << "  en hilos separados para maximo rendimiento.\n";
    alfred::print_separator();

    return 0;
}
