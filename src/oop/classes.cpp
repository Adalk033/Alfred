// ============================================================================
// classes.cpp - Clases en C++
// ============================================================================
// JS: class MyClass { constructor() {} }   -> prototipo en runtime
// C++: class MyClass { public: MyClass(); } -> estructura en compilacion
//
// En C++ las clases definen exactamente cuanta memoria ocupa cada instancia.
// No hay propiedades dinamicas (no puedes hacer obj.nuevaProp = valor).
// Esto te obliga a disenar antes de escribir = mejores practicas.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include "utils.h"

// -----------------------------------------------------------------
// STRUCT vs CLASS
// En C++ la UNICA diferencia es la visibilidad por defecto:
//   struct -> public por defecto
//   class  -> private por defecto
// Convencion: struct para datos, class para comportamiento.
// -----------------------------------------------------------------

// Struct: datos simples, todo publico por convencion
struct GpuInfo {
    std::string nombre;
    int vram_mb;
    bool cuda_disponible;
    int compute_capability_major;
    int compute_capability_minor;
};

// Class: tiene comportamiento, encapsula datos
class LlmModel {
// PRIVATE: solo accesible desde dentro de la clase
// En JS no habia privados reales hasta #privateField
private:
    std::string nombre_;        // Convencion C++: _ al final para miembros
    std::string ruta_archivo_;
    int parametros_billones_;
    bool cargado_;
    double temperatura_;

// PUBLIC: accesible desde fuera (como metodos normales en JS)
public:
    // -----------------------------------------------------------------
    // CONSTRUCTOR
    // JS: constructor(nombre, ruta) { this.nombre = nombre; }
    // C++: usa lista de inicializacion (mas eficiente que asignar en el cuerpo)
    // -----------------------------------------------------------------
    LlmModel(
        const std::string& nombre,
        const std::string& ruta,
        int parametros
    )
        : nombre_(nombre)              // Lista de inicializacion
        , ruta_archivo_(ruta)           // Cada miembro se inicializa directamente
        , parametros_billones_(parametros)
        , cargado_(false)
        , temperatura_(0.7)
    {
        // El cuerpo del constructor ejecuta DESPUES de la lista de inicializacion
        std::cout << "  [Constructor] Modelo creado: " << nombre_ << "\n";
    }

    // Constructor por defecto (sin parametros)
    LlmModel()
        : nombre_("desconocido")
        , ruta_archivo_("")
        , parametros_billones_(0)
        , cargado_(false)
        , temperatura_(0.7)
    {
        std::cout << "  [Constructor Default] Modelo vacio creado\n";
    }

    // -----------------------------------------------------------------
    // DESTRUCTOR
    // Se ejecuta automaticamente cuando el objeto sale de scope.
    // NO existe en JS (el garbage collector se encarga silenciosamente).
    // En C++ TU controlas cuando se libera la memoria.
    // -----------------------------------------------------------------
    ~LlmModel() {
        std::cout << "  [Destructor] Modelo destruido: " << nombre_ << "\n";
    }

    // -----------------------------------------------------------------
    // METODOS (funciones miembro)
    // -----------------------------------------------------------------

    // Metodo const: promete que NO modifica el estado del objeto
    // El compilador verifica esta promesa
    std::string get_nombre() const {
        return nombre_;
    }

    int get_parametros() const {
        return parametros_billones_;
    }

    bool esta_cargado() const {
        return cargado_;
    }

    // Metodo que modifica estado (no es const)
    void cargar() {
        if (ruta_archivo_.empty()) {
            std::cout << "  Error: no hay ruta de archivo\n";
            return;
        }
        std::cout << "  Cargando " << nombre_ << " desde " << ruta_archivo_ << "...\n";
        cargado_ = true;
    }

    void descargar() {
        if (!cargado_) return;
        std::cout << "  Descargando " << nombre_ << " de memoria...\n";
        cargado_ = false;
    }

    void set_temperatura(double temp) {
        // Validacion en el setter - la clase protege sus invariantes
        if (temp < 0.0 || temp > 2.0) {
            std::cout << "  Error: temperatura debe estar entre 0.0 y 2.0\n";
            return;
        }
        temperatura_ = temp;
    }

    // Metodo que retorna informacion formateada
    std::string to_string() const {
        return nombre_ + " ("
            + std::to_string(parametros_billones_) + "B) ["
            + (cargado_ ? "CARGADO" : "NO CARGADO")
            + "] temp=" + std::to_string(temperatura_);
    }

    // Generar respuesta simulada
    std::string generar(const std::string& prompt) const {
        if (!cargado_) {
            return "[Error: modelo no cargado]";
        }
        return "Respuesta de " + nombre_ + " a: \"" + prompt + "\"";
    }
};

int main() {
    alfred::print_separator("CLASES EN C++");

    // -----------------------------------------------------------------
    // STRUCTS
    // -----------------------------------------------------------------
    alfred::print_lesson("Structs",
        "Agrupan datos relacionados. Como un objeto literal tipado de JS.");

    GpuInfo mi_gpu;
    mi_gpu.nombre = "RTX 4060";
    mi_gpu.vram_mb = 8192;
    mi_gpu.cuda_disponible = true;
    mi_gpu.compute_capability_major = 8;
    mi_gpu.compute_capability_minor = 9;

    std::cout << "  GPU: " << mi_gpu.nombre
              << " | VRAM: " << mi_gpu.vram_mb << "MB"
              << " | CUDA: " << (mi_gpu.cuda_disponible ? "Si" : "No")
              << " | CC: " << mi_gpu.compute_capability_major
              << "." << mi_gpu.compute_capability_minor << "\n";

    // Inicializacion agregada (como un objeto literal)
    GpuInfo otra_gpu = {"RTX 3080", 10240, true, 8, 6};
    std::cout << "  GPU: " << otra_gpu.nombre << " | VRAM: " << otra_gpu.vram_mb << "MB\n";

    // -----------------------------------------------------------------
    // CLASES - Ciclo de vida
    // -----------------------------------------------------------------
    alfred::print_lesson("Clases y ciclo de vida",
        "Constructor al crear, Destructor al salir de scope.");

    {
        // Este bloque crea un scope. Cuando termina, los objetos se destruyen.
        std::cout << "\n  --- Entrando al scope ---\n";

        LlmModel gemma("gemma2:9b", "models/gemma2-9b.gguf", 9);
        LlmModel llama("llama3:8b", "models/llama3-8b.gguf", 8);

        gemma.cargar();
        llama.cargar();

        std::cout << "\n  " << gemma.to_string() << "\n";
        std::cout << "  " << llama.to_string() << "\n";

        std::cout << "\n  " << gemma.generar("Que es CUDA?") << "\n";

        gemma.set_temperatura(0.3);
        gemma.set_temperatura(5.0);  // Rechazado por validacion
        std::cout << "  " << gemma.to_string() << "\n";

        std::cout << "\n  --- Saliendo del scope ---\n";
        // Aqui se llaman los destructores automaticamente
        // En orden INVERSO a la creacion (LIFO)
    }

    // gemma y llama ya no existen aqui

    // -----------------------------------------------------------------
    // CONSTRUCTOR POR DEFECTO
    // -----------------------------------------------------------------
    alfred::print_lesson("Constructor por defecto",
        "Crea objetos sin parametros, con valores iniciales.");

    LlmModel modelo_vacio;
    std::cout << "  " << modelo_vacio.to_string() << "\n";

    // -----------------------------------------------------------------
    // OBJETOS EN VECTORES
    // -----------------------------------------------------------------
    alfred::print_lesson("Objetos en contenedores",
        "Los vectores pueden almacenar objetos como arrays de JS.");

    std::cout << "\n  --- Creando vector de modelos ---\n";
    std::vector<LlmModel> modelos;
    modelos.emplace_back("phi3", "models/phi3.gguf", 3);
    modelos.emplace_back("mistral", "models/mistral.gguf", 7);

    for (const auto& m : modelos) {
        std::cout << "  > " << m.to_string() << "\n";
    }

    std::cout << "\n  --- Vector sera destruido ---\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: En C++ las clases definen EXACTAMENTE\n";
    std::cout << "  cuanta memoria usan y cuando se liberan. Los constructores\n";
    std::cout << "  y destructores te dan control total del ciclo de vida.\n";
    std::cout << "  Esto es lo que JS delega al garbage collector.\n";
    alfred::print_separator();

    return 0;
}
