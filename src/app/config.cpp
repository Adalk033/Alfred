// ============================================================================
// config.cpp - Configuracion global y plantillas de prompt
// ============================================================================
#include "alfred/config.h"
#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>

namespace alfred {

// Singleton de configuracion
AppConfig& get_config() {
    static AppConfig config;
    return config;
}

std::string get_current_datetime() {
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    std::tm tm_now{};
#ifdef _WIN32
    localtime_s(&tm_now, &time_t_now);
#else
    localtime_r(&time_t_now, &tm_now);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm_now, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

// ============================================================================
// Plantilla SIN documentos (conocimiento general)
// ============================================================================
const std::string PROMPT_TEMPLATE_NO_DOCUMENTS = R"(System: You are {ASSISTANT_NAME}, a helpful personal AI assistant.
You must ALWAYS respond in Spanish.
You are running 100% locally - no data is sent externally.

User Profile:
- Name: {USER_NAME}
- Age: {USER_AGE}
- Occupation: {USER_OCCUPATION}
- About: {ABOUT_USER}

Current date and time: {DATETIME}

Tone and style:
{TONE_DIRECTIVE}

Additional instructions from the user:
{CUSTOM_INSTRUCTIONS}

Guidelines:
- Rely on your general knowledge to answer.
- Maintain conversation continuity using the context below.
- Always respond in Spanish and follow the tone and instructions above.

Conversation context:
{context}

User question: {input}

{ASSISTANT_NAME}:)";

} // namespace alfred
