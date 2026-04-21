// ============================================================================
// tone.cpp - Mapeo de tonos a directivas del system prompt
// ============================================================================
#include "alfred/tone.h"
#include <unordered_map>

namespace alfred {

ToneSpec resolve_tone(const std::string& key) {
    static const std::unordered_map<std::string, ToneSpec> MAP = {
        {"professional", {
            "Usa lenguaje formal, preciso y profesional. "
            "Estructura las respuestas con claridad y evita coloquialismos."
        }},
        {"friendly", {
            "Responde con un tono cercano y amigable, sin perder rigor. "
            "Puedes usar ejemplos cotidianos y un trato calido."
        }},
        {"concise", {
            "Se muy breve: evita rodeos, usa frases cortas y ve al grano. "
            "Maximo 3 a 5 oraciones salvo que se pida explicitamente lo contrario."
        }},
        {"detailed", {
            "Proporciona explicaciones exhaustivas, con contexto, sub-secciones "
            "y ejemplos cuando sean utiles para que la respuesta sea completa."
        }},
        {"creative", {
            "Aporta variedad, analogias y perspectivas novedosas. "
            "Sientete libre de explorar enfoques poco convencionales y comparaciones ilustrativas."
        }},
    };

    auto it = MAP.find(key);
    if (it != MAP.end()) return it->second;
    return MAP.at("professional");
}

} // namespace alfred
