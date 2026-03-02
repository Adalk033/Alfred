// ============================================================================
// variables.cpp - Sistema de tipos en C++
// ============================================================================
// DIFERENCIA CLAVE CON JS:
// En JavaScript: let x = 42;     -> el tipo se infiere en runtime
// En C++:        int x = 42;     -> el tipo se define en compilacion
//
// Esto significa que el compilador detecta errores antes de ejecutar.
// Si intentas hacer int x = "hola"; el compilador te detiene.
// En JS eso pasaria silenciosamente.
// ============================================================================

#include <iostream>
#include <string>
#include <cstdint>     // Tipos con tamano fijo (int32_t, uint64_t, etc.)
#include <limits>      // Limites de cada tipo
#include "utils.h"

int main() {
    alfred::print_separator("VARIABLES Y TIPOS EN C++");

    // -----------------------------------------------------------------
    // TIPOS ENTEROS
    // En JS solo tienes Number (double de 64 bits para todo).
    // En C++ eliges el tamano exacto que necesitas.
    // -----------------------------------------------------------------
    alfred::print_lesson("Tipos enteros",
        "En C++ eliges el tamano del numero. Menos memoria = mas eficiente.");

    int entero = 42;                    // Generalmente 32 bits
    short corto = 100;                  // Generalmente 16 bits
    long largo = 1000000L;              // Generalmente 32 o 64 bits
    long long muy_largo = 9000000000LL; // Siempre al menos 64 bits

    std::cout << "  int entero       = " << entero << " (tamano: " << sizeof(entero) << " bytes)\n";
    std::cout << "  short corto      = " << corto << " (tamano: " << sizeof(corto) << " bytes)\n";
    std::cout << "  long largo       = " << largo << " (tamano: " << sizeof(largo) << " bytes)\n";
    std::cout << "  long long grande = " << muy_largo << " (tamano: " << sizeof(muy_largo) << " bytes)\n";

    // Tipos con tamano garantizado (recomendados para codigo portable)
    int32_t exacto_32 = 42;
    uint64_t sin_signo_64 = 18446744073709551615ULL; // maximo uint64

    std::cout << "\n  int32_t  = " << exacto_32 << " (siempre 4 bytes)\n";
    std::cout << "  uint64_t = " << sin_signo_64 << " (siempre 8 bytes)\n";

    // -----------------------------------------------------------------
    // TIPOS DECIMALES
    // JS usa Number (double) para todo. C++ te da opciones.
    // -----------------------------------------------------------------
    alfred::print_lesson("Tipos decimales",
        "float = 4 bytes, double = 8 bytes. Mas bytes = mas precision.");

    float precio = 19.99f;              // 4 bytes, ~7 digitos de precision
    double pi = 3.14159265358979323;    // 8 bytes, ~15 digitos de precision

    std::cout << "  float precio  = " << precio << " (tamano: " << sizeof(precio) << " bytes)\n";
    std::cout << "  double pi     = " << pi << " (tamano: " << sizeof(pi) << " bytes)\n";

    // -----------------------------------------------------------------
    // BOOL Y CHAR
    // En JS: true/false son truthy/falsy con coercion implicita.
    // En C++: bool es estricto, pero se convierte a int (true=1, false=0).
    // -----------------------------------------------------------------
    alfred::print_lesson("bool y char",
        "bool es 1 byte. char es 1 byte y representa un caracter ASCII.");

    bool activo = true;
    char letra = 'A';                   // Un solo caracter, comillas simples
    char numero_ascii = 65;             // 'A' en ASCII, char ES un numero

    std::cout << "  bool activo = " << activo << " (tamano: " << sizeof(activo) << " byte)\n";
    std::cout << "  char letra = " << letra << " (valor numerico: " << static_cast<int>(letra) << ")\n";
    std::cout << "  char 65    = " << numero_ascii << " (char y entero son intercambiables)\n";

    // -----------------------------------------------------------------
    // STRINGS
    // JS: "hola" y 'hola' son lo mismo.
    // C++: "hola" es un C-string (array de char), std::string es el moderno.
    // -----------------------------------------------------------------
    alfred::print_lesson("std::string",
        "std::string es similar a String de JS pero sin garbage collector.");

    std::string nombre = "Alfred";
    std::string version = "0.1.0";
    std::string completo = nombre + " v" + version; // Concatenacion como en JS

    std::cout << "  nombre   = " << nombre << " (length: " << nombre.length() << ")\n";
    std::cout << "  completo = " << completo << "\n";
    std::cout << "  substr   = " << nombre.substr(0, 3) << " (como slice(0,3) en JS)\n";
    std::cout << "  find 'r' = posicion " << nombre.find('r') << "\n";

    // -----------------------------------------------------------------
    // CONST Y CONSTEXPR
    // JS: const solo impide reasignar la variable.
    // C++: const es realmente inmutable. constexpr se evalua en compilacion.
    // -----------------------------------------------------------------
    alfred::print_lesson("const y constexpr",
        "const = inmutable en runtime. constexpr = inmutable en compilacion.");

    const int MAX_TOKENS = 4096;
    constexpr int EMBEDDING_DIM = 384;     // Calculado por el compilador
    constexpr double GOLDEN_RATIO = 1.618; // Nunca existe en runtime

    std::cout << "  const MAX_TOKENS     = " << MAX_TOKENS << "\n";
    std::cout << "  constexpr EMBED_DIM  = " << EMBEDDING_DIM << "\n";
    std::cout << "  constexpr GOLDEN     = " << GOLDEN_RATIO << "\n";

    // MAX_TOKENS = 8192;  // ERROR de compilacion: no se puede modificar const

    // -----------------------------------------------------------------
    // AUTO (inferencia de tipos)
    // Similar al let de JS pero el tipo se fija en compilacion.
    // -----------------------------------------------------------------
    alfred::print_lesson("auto",
        "auto infiere el tipo en compilacion. NO es como var/let de JS.");

    auto numero = 42;                   // int (inferido)
    auto decimal = 3.14;                // double (inferido)
    auto texto = std::string("hola");   // std::string (inferido)
    auto caracter = 'x';                // char (inferido)

    std::cout << "  auto 42    -> sizeof = " << sizeof(numero) << " (int)\n";
    std::cout << "  auto 3.14  -> sizeof = " << sizeof(decimal) << " (double)\n";
    std::cout << "  auto \"hola\" -> length = " << texto.length() << " (string)\n";
    std::cout << "  auto 'x'   -> sizeof = " << sizeof(caracter) << " (char)\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: En C++ el tipo es parte de la identidad\n";
    std::cout << "  de la variable. No hay coercion implicita como en JS.\n";
    std::cout << "  Esto previene bugs que en JS pasarian desapercibidos.\n";
    alfred::print_separator();

    return 0;
}
