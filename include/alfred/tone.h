// ============================================================================
// tone.h - Resolucion del tono de respuesta del asistente
// ============================================================================
// Cada tono traduce a una directiva textual que se inyecta en el system
// prompt. No modifica parametros de sampling: la variacion queda confinada
// a la instruccion en lenguaje natural, preservando un comportamiento
// predecible para el modelo.
// ============================================================================
#pragma once

#include <string>

namespace alfred {

struct ToneSpec {
    std::string directive;   // texto inyectado en el system prompt
};

// Tonos soportados: "professional" (default), "friendly", "concise",
// "detailed", "creative". Una clave desconocida retorna "professional".
ToneSpec resolve_tone(const std::string& key);

} // namespace alfred
