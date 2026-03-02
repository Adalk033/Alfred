// ============================================================================
// functions.cpp - Funciones en C++
// ============================================================================
// DIFERENCIA CLAVE CON JS:
// JS: function suma(a, b) { return a + b; }  -> tipos resueltos en runtime
// C++: int suma(int a, int b) { return a + b; } -> tipos verificados en compile
//
// En C++ las funciones declaran explicitamente:
//   - Tipo de retorno (int, void, string, etc.)
//   - Tipo de cada parametro
//   - Si pasan por valor, referencia o puntero
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include "utils.h"

// -----------------------------------------------------------------
// DECLARACION ADELANTADA (forward declaration)
// En C++ debes declarar la funcion ANTES de usarla.
// Esto no existe en JS donde el hoisting lo hace automatico.
// -----------------------------------------------------------------
int sumar(int a, int b);
void imprimir_info(const std::string& mensaje);
double calcular_promedio(const std::vector<double>& valores);

// -----------------------------------------------------------------
// PASO POR VALOR vs POR REFERENCIA
// En JS: primitivos por valor, objetos por referencia (siempre).
// En C++: TU decides como pasar cada parametro.
// -----------------------------------------------------------------

// Por valor: crea una COPIA del argumento (como primitivos en JS)
void duplicar_valor(int numero) {
    numero *= 2;
    std::cout << "  Dentro de la funcion: " << numero << "\n";
    // El original NO cambia - trabajamos con una copia
}

// Por referencia (&): modifica el ORIGINAL (como objetos en JS)
void duplicar_referencia(int& numero) {
    numero *= 2;
    std::cout << "  Dentro de la funcion: " << numero << "\n";
    // El original SI cambia - & significa "referencia al original"
}

// Por referencia constante (const &): lee sin copiar ni modificar
// Esta es la forma RECOMENDADA de pasar structs/strings/vectors grandes
void imprimir_info(const std::string& mensaje) {
    std::cout << "  Info: " << mensaje << "\n";
    // mensaje es read-only, no se puede modificar
    // mensaje = "otra cosa";  // ERROR de compilacion
}

// -----------------------------------------------------------------
// PARAMETROS POR DEFECTO - Similar a JS
// -----------------------------------------------------------------
std::string formatear_modelo(
    const std::string& nombre,
    int parametros = 7,
    const std::string& cuantizacion = "Q4_K_M"
) {
    return nombre + " (" + std::to_string(parametros) + "B, " + cuantizacion + ")";
}

// -----------------------------------------------------------------
// SOBRECARGA DE FUNCIONES (Function Overloading)
// En JS NO existe. En C++ puedes tener multiples funciones con el
// mismo nombre pero diferentes parametros. El compilador elige cual usar.
// -----------------------------------------------------------------
int multiplicar(int a, int b) {
    return a * b;
}

double multiplicar(double a, double b) {
    return a * b;
}

std::string multiplicar(const std::string& texto, int veces) {
    std::string resultado;
    for (int i = 0; i < veces; ++i) {
        resultado += texto;
    }
    return resultado;
}

// -----------------------------------------------------------------
// FUNCIONES INLINE
// Sugerencia al compilador de que inserte el codigo directamente
// en vez de hacer una llamada. Para funciones pequenas y frecuentes.
// -----------------------------------------------------------------
inline int maximo(int a, int b) {
    return (a > b) ? a : b;
}

// -----------------------------------------------------------------
// AUTO COMO TIPO DE RETORNO (C++14)
// El compilador infiere el tipo de retorno
// -----------------------------------------------------------------
auto crear_descripcion(const std::string& modelo, bool gpu) {
    // El compilador deduce que retorna std::string
    return modelo + (gpu ? " [GPU]" : " [CPU]");
}

// Implementacion de funciones declaradas arriba
int sumar(int a, int b) {
    return a + b;
}

double calcular_promedio(const std::vector<double>& valores) {
    if (valores.empty()) return 0.0;

    double suma = 0.0;
    for (const auto& v : valores) {
        suma += v;
    }
    return suma / static_cast<double>(valores.size());
}

int main() {
    alfred::print_separator("FUNCIONES EN C++");

    // Funciones basicas
    alfred::print_lesson("Funciones tipadas",
        "Cada parametro y el retorno tienen tipo explicito.");

    int resultado = sumar(10, 20);
    std::cout << "  sumar(10, 20) = " << resultado << "\n";

    std::vector<double> scores = {0.85, 0.92, 0.78, 0.95, 0.88};
    double promedio = calcular_promedio(scores);
    std::cout << "  promedio de scores = " << promedio << "\n";

    // Valor vs referencia
    alfred::print_lesson("Paso por valor vs referencia",
        "En C++ TU decides si la funcion recibe copia o referencia.");

    int numero = 10;
    std::cout << "  Original: " << numero << "\n";

    std::cout << "  --- Por valor (copia) ---\n";
    duplicar_valor(numero);
    std::cout << "  Despues: " << numero << " (no cambio)\n";

    std::cout << "  --- Por referencia (&) ---\n";
    duplicar_referencia(numero);
    std::cout << "  Despues: " << numero << " (SI cambio)\n";

    // Parametros por defecto
    alfred::print_lesson("Parametros por defecto",
        "Similar a JS: function(a, b = 10)");

    std::cout << "  " << formatear_modelo("gemma2") << "\n";
    std::cout << "  " << formatear_modelo("llama3", 70) << "\n";
    std::cout << "  " << formatear_modelo("mistral", 7, "Q8_0") << "\n";

    // Sobrecarga
    alfred::print_lesson("Sobrecarga de funciones",
        "Mismo nombre, diferentes parametros. No existe en JS.");

    std::cout << "  multiplicar(3, 4)        = " << multiplicar(3, 4) << "\n";
    std::cout << "  multiplicar(2.5, 3.0)    = " << multiplicar(2.5, 3.0) << "\n";
    std::cout << "  multiplicar(\"ab\", 3)     = " << multiplicar("ab", 3) << "\n";

    // Auto retorno
    alfred::print_lesson("auto return type",
        "El compilador infiere el tipo de retorno.");

    auto desc = crear_descripcion("gemma2:9b", true);
    std::cout << "  " << desc << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Las funciones en C++ son contratos explicitos.\n";
    std::cout << "  Los tipos en firma = documentacion que el compilador verifica.\n";
    std::cout << "  La sobrecarga y const& son herramientas que JS no tiene.\n";
    alfred::print_separator();

    return 0;
}
