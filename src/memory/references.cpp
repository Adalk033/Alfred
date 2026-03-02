// ============================================================================
// references.cpp - Referencias en C++
// ============================================================================
// Las referencias son la alternativa SEGURA a los punteros.
// Un puntero PUEDE ser null, PUEDE apuntar a memoria invalida.
// Una referencia SIEMPRE apunta a algo valido y no puede reasignarse.
//
// En JS: cuando pasas un objeto a una funcion, es una referencia implicita.
// En C++: tu eliges explicitamente si quieres una copia o una referencia.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>
#include "utils.h"

// -----------------------------------------------------------------
// FUNCIONES CON DIFERENTES FORMAS DE PASAR DATOS
// -----------------------------------------------------------------

// Por valor: COPIA el string (costoso para strings grandes)
void por_valor(std::string texto) {
    texto += " (modificado)";
    std::cout << "  Dentro (valor): " << texto << "\n";
}

// Por referencia: accede al ORIGINAL (sin copia, puede modificar)
void por_referencia(std::string& texto) {
    texto += " (modificado)";
    std::cout << "  Dentro (ref):   " << texto << "\n";
}

// Por referencia constante: accede al ORIGINAL sin copiarlo NI modificarlo
// ESTA ES LA FORMA RECOMENDADA de pasar objetos grandes
void por_const_ref(const std::string& texto) {
    std::cout << "  Dentro (cref):  " << texto << "\n";
    // texto += " nope";  // ERROR: es const
}

// Retornar por referencia: devuelve referencia a dato existente
// CUIDADO: nunca retornar referencia a variable local
const std::string& mayor(const std::string& a, const std::string& b) {
    return (a.length() >= b.length()) ? a : b;
}

int main() {
    alfred::print_separator("REFERENCIAS EN C++");

    // -----------------------------------------------------------------
    // REFERENCIA BASICA
    // -----------------------------------------------------------------
    alfred::print_lesson("Referencia basica (&)",
        "Un alias para otra variable. Siempre valida, no puede ser null.");

    int original = 42;
    int& ref = original;  // ref ES original, otro nombre para la misma memoria

    std::cout << "  original = " << original << "\n";
    std::cout << "  ref      = " << ref << " (mismo valor, misma direccion)\n";
    std::cout << "  &original = " << &original << "\n";
    std::cout << "  &ref      = " << &ref << " (misma direccion!)\n";

    ref = 100;  // Cambiar la referencia cambia el original
    std::cout << "\n  ref = 100;\n";
    std::cout << "  original = " << original << " (cambio a traves de ref)\n";

    // -----------------------------------------------------------------
    // DIFERENCIAS CON PUNTEROS
    // -----------------------------------------------------------------
    alfred::print_lesson("Referencia vs Puntero",
        "Referencia = segura, simple. Puntero = flexible, peligroso.");

    std::cout << "\n  Referencia:\n";
    std::cout << "    - No puede ser null\n";
    std::cout << "    - No puede reasignarse\n";
    std::cout << "    - No necesita * para acceder\n";
    std::cout << "    - Se usa con . (no con ->)\n";

    std::cout << "\n  Puntero:\n";
    std::cout << "    - Puede ser nullptr\n";
    std::cout << "    - Puede apuntar a otro objeto\n";
    std::cout << "    - Necesita * para desreferenciar\n";
    std::cout << "    - Se usa con -> para miembros\n";

    // -----------------------------------------------------------------
    // PASO POR VALOR vs REFERENCIA vs CONST REF
    // -----------------------------------------------------------------
    alfred::print_lesson("Tres formas de pasar datos a funciones",
        "Valor = copia, & = referencia, const& = referencia solo lectura.");

    std::string mi_texto = "Hola Alfred";

    std::cout << "\n  Texto original: \"" << mi_texto << "\"\n\n";

    // Por valor: se crea una copia
    por_valor(mi_texto);
    std::cout << "  Despues (valor): \"" << mi_texto << "\" (no cambio)\n\n";

    // Por referencia: modifica el original
    por_referencia(mi_texto);
    std::cout << "  Despues (ref):   \"" << mi_texto << "\" (SI cambio)\n\n";

    // Por const ref: lee sin copiar ni modificar
    por_const_ref(mi_texto);
    std::cout << "  Despues (cref):  \"" << mi_texto << "\" (no cambio)\n";

    // -----------------------------------------------------------------
    // CUANDO USAR CADA UNA
    // -----------------------------------------------------------------
    alfred::print_lesson("Reglas de uso",
        "Guia practica para elegir como pasar parametros.");

    std::cout << "\n  Tipos pequenos (int, float, bool, char):\n";
    std::cout << "    -> Pasar por VALOR (copiar es barato)\n";

    std::cout << "\n  Tipos grandes que NO necesitas modificar (string, vector, clases):\n";
    std::cout << "    -> Pasar por CONST REFERENCIA (const&)\n";

    std::cout << "\n  Tipos que necesitas MODIFICAR:\n";
    std::cout << "    -> Pasar por REFERENCIA (&)\n";

    std::cout << "\n  Opcionalmente nulo (puede no existir):\n";
    std::cout << "    -> Pasar por PUNTERO (puede ser nullptr)\n";

    // -----------------------------------------------------------------
    // REFERENCIA A ELEMENTOS DE CONTENEDORES
    // -----------------------------------------------------------------
    alfred::print_lesson("Referencias en loops",
        "const auto& evita copiar cada elemento al iterar.");

    std::vector<std::string> modelos = {
        "gemma2:9b", "llama3:8b", "mistral:7b", "phi3:3b"
    };

    std::cout << "\n  Con copia (auto m):\n";
    for (auto m : modelos) {
        // m es una COPIA de cada string - desperdicio de memoria
        std::cout << "    " << m << "\n";
    }

    std::cout << "\n  Con referencia (const auto& m):\n";
    for (const auto& m : modelos) {
        // m es una referencia al string original - sin copia
        std::cout << "    " << m << "\n";
    }

    // Modificar elementos via referencia
    std::cout << "\n  Modificando via referencia (auto& m):\n";
    for (auto& m : modelos) {
        m = "[OK] " + m;  // Modifica el vector original
    }
    for (const auto& m : modelos) {
        std::cout << "    " << m << "\n";
    }

    // -----------------------------------------------------------------
    // RETORNAR POR REFERENCIA
    // -----------------------------------------------------------------
    alfred::print_lesson("Retornar por referencia",
        "Retorna referencia a dato existente. NO a variables locales.");

    const std::string a = "texto corto";
    const std::string b = "texto mucho mas largo";

    const std::string& resultado = mayor(a, b);
    std::cout << "\n  mayor(\"texto corto\", \"texto mucho mas largo\")\n";
    std::cout << "  -> \"" << resultado << "\"\n";

    alfred::print_separator();
    std::cout << "  Leccion clave: En C++ moderno, prefiere referencias sobre punteros.\n";
    std::cout << "  const& es tu mejor amigo para pasar datos sin copiar.\n";
    std::cout << "  Es la forma en que C++ te permite ser eficiente Y seguro.\n";
    std::cout << "  Regla de oro: const& por defecto, & si necesitas modificar.\n";
    alfred::print_separator();

    return 0;
}
