// ============================================================================
// pdf_extractor.h - Extraccion de texto desde PDFs
// ============================================================================
// Convierte archivos PDF en texto plano UTF-8 usando PDFium. Nunca falla
// silenciosamente: si el PDF no es procesable, el campo `error` lo indica
// y el cliente puede reportar un mensaje claro. El backend NO devuelve
// jamas "no puedo leer PDFs" al modelo.
// ============================================================================
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace alfred {

class LLMEngine;

struct PdfChunk {
    int page_start = 0;   // 1-based
    int page_end   = 0;
    std::string text;
    int tokens = 0;
};

struct PdfDocument {
    bool ok = false;
    std::string error;

    std::string title;
    int pages = 0;
    int total_tokens = 0;
    std::vector<PdfChunk> chunks;

    // Texto plano completo concatenado (para inyectar en prompt o log).
    std::string full_text() const;
};

class PdfExtractor {
public:
    // Extrae texto de un PDF en memoria. Si `llm` esta cargado, cuenta tokens
    // reales por chunk; si es nullptr o el modelo no esta cargado, deja
    // tokens = 0 en cada chunk y total_tokens = 0.
    //
    // Parametros de chunking:
    //   target_tokens  : tamano objetivo por chunk (0 = un solo chunk)
    //   overlap_tokens : solapamiento entre chunks consecutivos
    static PdfDocument extract_from_bytes(const uint8_t* data, size_t size,
                                          LLMEngine* llm = nullptr,
                                          int target_tokens = 800,
                                          int overlap_tokens = 80);

    static PdfDocument extract_from_path(const std::string& path,
                                         LLMEngine* llm = nullptr,
                                         int target_tokens = 800,
                                         int overlap_tokens = 80);

    // Inicializacion/cleanup del backend PDFium. Llamar una vez al arranque
    // y una vez al apagado. Seguro llamar multiple veces.
    static void initialize();
    static void shutdown();
};

} // namespace alfred
