// ============================================================================
// inheritance.cpp - Herencia en C++
// ============================================================================
// JS: class Child extends Parent {}
// C++: class Child : public Parent {}
//
// Diferencia clave: C++ tiene herencia multiple (de varias clases a la vez).
// JS solo tiene cadena de prototipos simple + mixins.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include "utils.h"

// Clase base: cualquier motor de inferencia
class InferenceEngine {
protected:      // Protected: accesible desde clases hijas, no desde fuera
    std::string nombre_;
    bool inicializado_;
    int max_tokens_;

public:
    // Constructor de la clase base
    InferenceEngine(const std::string& nombre, int max_tokens)
        : nombre_(nombre)
        , inicializado_(false)
        , max_tokens_(max_tokens)
    {
        std::cout << "  [InferenceEngine] Creado: " << nombre_ << "\n";
    }

    // Destructor virtual: CRITICO para herencia
    // Sin virtual, al destruir via puntero a base, el destructor hijo no se llama
    virtual ~InferenceEngine() {
        std::cout << "  [InferenceEngine] Destruido: " << nombre_ << "\n";
    }

    // Metodo virtual: puede ser sobrescrito por clases hijas
    virtual bool inicializar() {
        std::cout << "  Inicializando engine base: " << nombre_ << "\n";
        inicializado_ = true;
        return true;
    }

    // Metodo virtual puro (= 0): DEBE ser implementado por las hijas
    // Hace la clase abstracta (no se puede instanciar directamente)
    virtual std::string inferir(const std::string& prompt) = 0;

    // Metodo no virtual: NO se puede sobrescribir (comun a todas las hijas)
    std::string get_nombre() const {
        return nombre_;
    }

    bool esta_listo() const {
        return inicializado_;
    }

    virtual std::string get_info() const {
        return nombre_ + " (max_tokens: " + std::to_string(max_tokens_) + ")";
    }
};

// Clase hija: motor de inferencia CUDA
class CudaEngine : public InferenceEngine {
private:
    int gpu_layers_;
    std::string modelo_path_;

public:
    // Constructor hijo llama al constructor padre
    CudaEngine(const std::string& modelo_path, int gpu_layers)
        : InferenceEngine("CUDA Engine", 4096)  // Llama al constructor base
        , gpu_layers_(gpu_layers)
        , modelo_path_(modelo_path)
    {
        std::cout << "  [CudaEngine] GPU layers: " << gpu_layers_ << "\n";
    }

    ~CudaEngine() override {
        std::cout << "  [CudaEngine] Liberando VRAM...\n";
    }

    // Override del metodo virtual
    bool inicializar() override {
        // Llama al metodo de la clase padre primero
        InferenceEngine::inicializar();
        std::cout << "  Cargando modelo en GPU: " << modelo_path_ << "\n";
        std::cout << "  Capas en GPU: " << gpu_layers_ << "\n";
        return true;
    }

    // Implementacion del metodo puro (obligatorio)
    std::string inferir(const std::string& prompt) override {
        if (!inicializado_) {
            return "[CUDA Engine no inicializado]";
        }
        return "[CUDA] Respuesta a: " + prompt;
    }

    std::string get_info() const override {
        return "CUDA Engine | modelo: " + modelo_path_
            + " | layers: " + std::to_string(gpu_layers_);
    }
};

// Otra clase hija: motor de inferencia CPU
class CpuEngine : public InferenceEngine {
private:
    int threads_;

public:
    CpuEngine(int threads)
        : InferenceEngine("CPU Engine", 2048)
        , threads_(threads)
    {
        std::cout << "  [CpuEngine] Threads: " << threads_ << "\n";
    }

    ~CpuEngine() override {
        std::cout << "  [CpuEngine] Liberando memoria RAM...\n";
    }

    std::string inferir(const std::string& prompt) override {
        if (!inicializado_) {
            return "[CPU Engine no inicializado]";
        }
        return "[CPU " + std::to_string(threads_) + "t] Respuesta a: " + prompt;
    }

    std::string get_info() const override {
        return "CPU Engine | threads: " + std::to_string(threads_);
    }
};

// -----------------------------------------------------------------
// HERENCIA MULTIPLE (no existe en JS)
// Una clase puede heredar de multiples clases base.
// -----------------------------------------------------------------

class Serializable {
public:
    virtual ~Serializable() = default;
    virtual std::string serializar() const = 0;
};

class Loggable {
public:
    virtual ~Loggable() = default;
    void log(const std::string& mensaje) const {
        std::cout << "  [LOG] " << mensaje << "\n";
    }
};

// Hereda de CudaEngine, Serializable y Loggable
class AdvancedCudaEngine : public CudaEngine, public Serializable, public Loggable {
public:
    AdvancedCudaEngine(const std::string& modelo, int layers)
        : CudaEngine(modelo, layers)
    {}

    std::string serializar() const override {
        return "{\"engine\": \"cuda\", \"nombre\": \"" + get_nombre() + "\"}";
    }
};

int main() {
    alfred::print_separator("HERENCIA EN C++");

    // -----------------------------------------------------------------
    // HERENCIA BASICA
    // -----------------------------------------------------------------
    alfred::print_lesson("Herencia basica",
        "class Hijo : public Padre. Similar a extends en JS.");

    std::cout << "\n  --- Creando engines ---\n";
    CudaEngine cuda_engine("models/gemma2-9b.gguf", 33);
    CpuEngine cpu_engine(8);

    cuda_engine.inicializar();
    cpu_engine.inicializar();

    std::cout << "\n  Info CUDA: " << cuda_engine.get_info() << "\n";
    std::cout << "  Info CPU:  " << cpu_engine.get_info() << "\n";

    std::cout << "\n  " << cuda_engine.inferir("Que es CUDA?") << "\n";
    std::cout << "  " << cpu_engine.inferir("Que es CUDA?") << "\n";

    // -----------------------------------------------------------------
    // POLIMORFISMO CON PUNTEROS A BASE
    // Puedes tratar diferentes engines de la misma forma
    // -----------------------------------------------------------------
    alfred::print_lesson("Polimorfismo basico",
        "Punteros a clase base pueden apuntar a cualquier hijo.");

    std::cout << "\n";
    // Vector de punteros a la clase base
    std::vector<InferenceEngine*> engines;
    engines.push_back(&cuda_engine);
    engines.push_back(&cpu_engine);

    // Itera sin saber el tipo concreto - el virtual dispatch llama al metodo correcto
    for (const auto* engine : engines) {
        std::cout << "  [" << engine->get_nombre() << "] "
                  << engine->get_info() << "\n";
    }

    // -----------------------------------------------------------------
    // HERENCIA MULTIPLE
    // -----------------------------------------------------------------
    alfred::print_lesson("Herencia multiple",
        "Una clase hereda de varias. No existe en JS.");

    std::cout << "\n  --- AdvancedCudaEngine ---\n";
    AdvancedCudaEngine avanzado("models/llama3.gguf", 40);
    avanzado.inicializar();
    avanzado.log("Motor inicializado correctamente");
    std::cout << "  Serializado: " << avanzado.serializar() << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: La herencia en C++ es mas poderosa que en JS.\n";
    std::cout << "  virtual = metodo que puede sobrescribirse (polimorfismo).\n";
    std::cout << "  = 0 = metodo abstracto que DEBE implementarse.\n";
    std::cout << "  virtual ~Destructor = SIEMPRE en clases base con herencia.\n";
    alfred::print_separator();

    return 0;
}
