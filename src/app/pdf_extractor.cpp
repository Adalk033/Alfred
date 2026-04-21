// ============================================================================
// pdf_extractor.cpp - Extraccion de texto desde PDFs via PDFium
// ============================================================================
#include "alfred/pdf_extractor.h"

#include "alfred/llm_engine.h"
#include "alfred/logger.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>

// PDFium public API. Las cabeceras vienen del paquete pdfium-binaries
// configurado en CMakeLists.txt.
#include <fpdfview.h>
#include <fpdf_text.h>

namespace alfred {

namespace {

std::once_flag g_pdfium_init_flag;
std::mutex     g_pdfium_mutex;   // PDFium no es thread-safe para documentos

// Colapsa whitespace consecutivo, normaliza saltos de linea y quita
// caracteres de control invisibles.
std::string clean_text(const std::string& raw) {
    std::string out;
    out.reserve(raw.size());
    bool prev_space = false;
    for (size_t i = 0; i < raw.size(); ++i) {
        unsigned char c = static_cast<unsigned char>(raw[i]);
        if (c == '\r') continue;
        if (c == '\t') c = ' ';
        if (c < 0x20 && c != '\n') continue;           // controles invisibles
        if (c == ' ') {
            if (prev_space) continue;
            prev_space = true;
            out.push_back(' ');
        } else if (c == '\n') {
            // no colapsar '\n\n\n' mas alla de 2
            size_t nl = 1;
            while (i + 1 < raw.size() && raw[i + 1] == '\n') { ++i; ++nl; }
            out.push_back('\n');
            if (nl > 1) out.push_back('\n');
            prev_space = false;
        } else {
            out.push_back(static_cast<char>(c));
            prev_space = false;
        }
    }
    // Trim final
    while (!out.empty() && std::isspace(static_cast<unsigned char>(out.back())))
        out.pop_back();
    return out;
}

// Conversion UTF-16LE -> UTF-8 (PDFium devuelve UTF-16LE).
std::string utf16le_to_utf8(const unsigned short* s, size_t len) {
    std::string out;
    out.reserve(len);
    for (size_t i = 0; i < len; ++i) {
        uint32_t cp = s[i];
        if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len) {
            uint32_t hi = cp - 0xD800;
            uint32_t lo = s[i + 1] - 0xDC00;
            cp = 0x10000 + (hi << 10) + lo;
            ++i;
        }
        if (cp == 0) continue;
        if (cp < 0x80) {
            out.push_back(static_cast<char>(cp));
        } else if (cp < 0x800) {
            out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp < 0x10000) {
            out.push_back(static_cast<char>(0xE0 |  (cp >> 12)));
            out.push_back(static_cast<char>(0x80 | ((cp >>  6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 |  (cp        & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 |  (cp >> 18)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((cp >>  6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 |  (cp        & 0x3F)));
        }
    }
    return out;
}

std::string extract_page_text(FPDF_PAGE page) {
    FPDF_TEXTPAGE tp = FPDFText_LoadPage(page);
    if (!tp) return "";

    int nchars = FPDFText_CountChars(tp);
    if (nchars <= 0) {
        FPDFText_ClosePage(tp);
        return "";
    }
    std::vector<unsigned short> buf(static_cast<size_t>(nchars) + 1, 0);
    int written = FPDFText_GetText(tp, 0, nchars, buf.data());
    FPDFText_ClosePage(tp);
    if (written <= 0) return "";
    // written incluye el terminador null que PDFium anade
    return utf16le_to_utf8(buf.data(), static_cast<size_t>(written - 1));
}

void chunk_by_tokens(std::vector<PdfChunk>& chunks_out,
                     LLMEngine* llm,
                     const std::vector<std::pair<int, std::string>>& pages,
                     int target_tokens,
                     int overlap_tokens)
{
    // Concatenar manteniendo mapeo a pagina
    std::string buf;
    int current_start_page = pages.empty() ? 0 : pages.front().first;
    int current_last_page  = current_start_page;

    auto flush = [&](int start, int end) {
        if (buf.empty()) return;
        PdfChunk c;
        c.page_start = start;
        c.page_end   = end;
        c.text       = clean_text(buf);
        c.tokens     = (llm && llm->is_loaded())
                       ? (std::max)(0, llm->count_tokens(c.text))
                       : 0;
        chunks_out.push_back(std::move(c));
        buf.clear();
    };

    if (target_tokens <= 0) {
        // Un solo chunk
        for (const auto& [p, t] : pages) {
            buf += t;
            buf += "\n\n";
            current_last_page = p;
        }
        flush(current_start_page, current_last_page);
        return;
    }

    for (const auto& [page_num, text] : pages) {
        buf += text;
        buf += "\n\n";
        current_last_page = page_num;

        // Estimar si alcanzamos target (sin tokenizer, usa 1 token ~ 4 chars)
        int est_tokens = (llm && llm->is_loaded())
                         ? llm->count_tokens(buf)
                         : static_cast<int>(buf.size() / 4);
        if (est_tokens >= target_tokens) {
            int end = current_last_page;
            // overlap: guarda las ultimas `overlap_tokens` (aprox en chars)
            std::string tail;
            if (overlap_tokens > 0) {
                size_t approx_chars = static_cast<size_t>(overlap_tokens) * 4;
                if (buf.size() > approx_chars) {
                    tail = buf.substr(buf.size() - approx_chars);
                }
            }
            flush(current_start_page, end);
            buf = tail;
            current_start_page = end;   // chunk siguiente empieza en la misma pagina
        }
    }
    flush(current_start_page, current_last_page);
}

} // namespace

void PdfExtractor::initialize() {
    std::call_once(g_pdfium_init_flag, []() {
        FPDF_LIBRARY_CONFIG cfg{};
        cfg.version = 2;
        cfg.m_pUserFontPaths = nullptr;
        cfg.m_pIsolate = nullptr;
        cfg.m_v8EmbedderSlot = 0;
        FPDF_InitLibraryWithConfig(&cfg);
        log_info("PDFium inicializado");
    });
}

void PdfExtractor::shutdown() {
    // PDFium no tiene counter: solo destruir si realmente inicializamos.
    // En la practica, la app vive hasta el proceso, asi que no hace falta.
}

PdfDocument PdfExtractor::extract_from_bytes(const uint8_t* data, size_t size,
                                             LLMEngine* llm,
                                             int target_tokens,
                                             int overlap_tokens)
{
    PdfDocument doc;
    if (!data || size == 0) {
        doc.error = "PDF vacio o puntero nulo";
        return doc;
    }

    initialize();

    std::lock_guard<std::mutex> lock(g_pdfium_mutex);

    FPDF_DOCUMENT pdf = FPDF_LoadMemDocument64(data, size, nullptr);
    if (!pdf) {
        unsigned long err = FPDF_GetLastError();
        switch (err) {
            case FPDF_ERR_PASSWORD: doc.error = "PDF protegido con contrasena"; break;
            case FPDF_ERR_FORMAT:   doc.error = "PDF con formato invalido o corrupto"; break;
            case FPDF_ERR_FILE:     doc.error = "Error leyendo el archivo PDF"; break;
            default:                doc.error = "No se pudo abrir el PDF (codigo " +
                                                std::to_string(err) + ")"; break;
        }
        return doc;
    }

    doc.pages = FPDF_GetPageCount(pdf);

    std::vector<std::pair<int, std::string>> page_texts;
    page_texts.reserve(static_cast<size_t>(doc.pages));

    for (int i = 0; i < doc.pages; ++i) {
        FPDF_PAGE page = FPDF_LoadPage(pdf, i);
        if (!page) continue;
        std::string t = extract_page_text(page);
        FPDF_ClosePage(page);
        page_texts.emplace_back(i + 1, std::move(t));
    }

    FPDF_CloseDocument(pdf);

    chunk_by_tokens(doc.chunks, llm, page_texts, target_tokens, overlap_tokens);
    for (const auto& c : doc.chunks) doc.total_tokens += c.tokens;

    doc.ok = true;
    return doc;
}

PdfDocument PdfExtractor::extract_from_path(const std::string& path,
                                            LLMEngine* llm,
                                            int target_tokens,
                                            int overlap_tokens)
{
    PdfDocument doc;
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        doc.error = "No se pudo abrir el archivo: " + path;
        return doc;
    }
    std::vector<uint8_t> buf((std::istreambuf_iterator<char>(in)),
                              std::istreambuf_iterator<char>());
    return extract_from_bytes(buf.data(), buf.size(), llm,
                              target_tokens, overlap_tokens);
}

std::string PdfDocument::full_text() const {
    std::ostringstream out;
    for (size_t i = 0; i < chunks.size(); ++i) {
        if (i) out << "\n\n";
        out << chunks[i].text;
    }
    return out.str();
}

} // namespace alfred
