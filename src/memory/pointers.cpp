// ============================================================================
// pointers.cpp - Punteros en C++
// ============================================================================
// ESTO NO EXISTE EN JS. Es el concepto mas importante de C/C++.
//
// Un puntero es una variable que almacena una DIRECCION DE MEMORIA.
// Imagina la RAM como un edificio con apartamentos numerados.
// Una variable normal ES el contenido del apartamento.
// Un puntero ES el NUMERO del apartamento.
//
// En JS nunca ves direcciones de memoria. El runtime lo maneja.
// En C++ tu decides donde vive cada dato y quien puede accederlo.
// ============================================================================

#include <iostream>
#include <string>
#include "utils.h"

int main() {
    alfred::print_separator("PUNTEROS EN C++");

    // -----------------------------------------------------------------
    // CONCEPTO BASICO
    // -----------------------------------------------------------------
    alfred::print_lesson("Que es un puntero?",
        "Una variable que almacena la DIRECCION de otra variable.");

    int numero = 42;
    int* puntero = &numero;  // & = "dame la direccion de"
                             // * en la declaracion = "esto es un puntero a int"

    std::cout << "  int numero = 42;\n";
    std::cout << "  int* puntero = &numero;\n\n";
    std::cout << "  numero              = " << numero << "          (el valor)\n";
    std::cout << "  &numero             = " << &numero << "  (la direccion en memoria)\n";
    std::cout << "  puntero             = " << puntero << "  (contiene la direccion)\n";
    std::cout << "  *puntero            = " << *puntero << "          (desreferencia: lee el valor en esa direccion)\n";

    // Modificar a traves del puntero
    alfred::print_lesson("Modificar via puntero",
        "*puntero = 100 cambia el valor en la direccion apuntada.");

    *puntero = 100;  // * para desreferenciar = "ve a esa direccion y cambia el valor"
    std::cout << "  *puntero = 100;\n";
    std::cout << "  numero ahora = " << numero << " (cambio via puntero)\n";

    // -----------------------------------------------------------------
    // PUNTERO NULL
    // -----------------------------------------------------------------
    alfred::print_lesson("nullptr",
        "Un puntero que no apunta a nada. Como null en JS pero para memoria.");

    int* ptr_nulo = nullptr;  // No apunta a ninguna direccion

    std::cout << "  int* ptr_nulo = nullptr;\n";
    std::cout << "  ptr_nulo == nullptr? " << (ptr_nulo == nullptr ? "Si" : "No") << "\n";

    // SIEMPRE verificar antes de desreferenciar
    if (ptr_nulo != nullptr) {
        std::cout << "  *ptr_nulo = " << *ptr_nulo << "\n";
    } else {
        std::cout << "  No se puede desreferenciar nullptr (crashearia)\n";
    }

    // -----------------------------------------------------------------
    // PUNTEROS Y ARRAYS
    // En C/C++ un array es basicamente un puntero al primer elemento
    // -----------------------------------------------------------------
    alfred::print_lesson("Punteros y arrays",
        "El nombre de un array ES un puntero a su primer elemento.");

    int datos[] = {10, 20, 30, 40, 50};
    int* ptr_datos = datos;  // datos ya es un puntero al primer elemento

    std::cout << "  datos[0]      = " << datos[0] << "\n";
    std::cout << "  *ptr_datos    = " << *ptr_datos << " (mismo que datos[0])\n";
    std::cout << "  *(ptr_datos+1)= " << *(ptr_datos + 1) << " (aritmetica de punteros)\n";
    std::cout << "  *(ptr_datos+2)= " << *(ptr_datos + 2) << "\n";

    // Iterar con puntero
    std::cout << "  Iterando con puntero: ";
    for (int* p = datos; p < datos + 5; ++p) {
        std::cout << *p << " ";
    }
    std::cout << "\n";

    // -----------------------------------------------------------------
    // PUNTEROS A FUNCIONES (callbacks en C++)
    // Similar a pasar funciones como parametro en JS
    // -----------------------------------------------------------------
    alfred::print_lesson("Punteros a funciones",
        "Pasar funciones como parametro. Como callbacks en JS.");

    // Declarar un puntero a funcion
    // JS: const fn = (a, b) => a + b;
    // C++: un tipo que apunta a una funcion int(int, int)
    auto sumar = [](int a, int b) -> int { return a + b; };
    auto multiplicar = [](int a, int b) -> int { return a * b; };

    // Almacenar en puntero a funcion
    int (*operacion)(int, int) = nullptr;

    operacion = sumar;
    std::cout << "  operacion = sumar:       " << operacion(5, 3) << "\n";

    operacion = multiplicar;
    std::cout << "  operacion = multiplicar: " << operacion(5, 3) << "\n";

    // -----------------------------------------------------------------
    // const CON PUNTEROS (confuso al inicio, importante entender)
    // -----------------------------------------------------------------
    alfred::print_lesson("const con punteros",
        "const puede aplicar al valor apuntado O al puntero mismo.");

    int valor = 42;
    int otro = 99;

    const int* ptr_a_const = &valor;     // No puedo cambiar *ptr, SI puedo cambiar ptr
    int* const ptr_const = &valor;        // SI puedo cambiar *ptr, NO puedo cambiar ptr
    const int* const ambos_const = &valor; // No puedo cambiar nada

    std::cout << "\n  const int* ptr_a_const   -> no puedo cambiar el VALOR (*ptr)\n";
    std::cout << "  int* const ptr_const     -> no puedo cambiar la DIRECCION (ptr)\n";
    std::cout << "  const int* const ambos   -> no puedo cambiar nada\n";

    // ptr_a_const: puedo apuntar a otro lugar, pero no modificar el valor
    ptr_a_const = &otro;  // OK: cambio la direccion
    // *ptr_a_const = 50; // ERROR: no puedo modificar el valor

    // ptr_const: puedo modificar el valor, pero no apuntar a otro lugar
    *ptr_const = 50;      // OK: cambio el valor
    // ptr_const = &otro;  // ERROR: no puedo cambiar la direccion

    std::cout << "\n  valor despues de *ptr_const = 50: " << valor << "\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: Los punteros son la base de todo en C/C++.\n";
    std::cout << "  Son el mecanismo por el cual controlas la memoria directamente.\n";
    std::cout << "  En la practica moderna, se prefieren referencias y smart pointers.\n";
    std::cout << "  Pero entender punteros es ESENCIAL para entender el lenguaje.\n";
    alfred::print_separator();

    return 0;
}
