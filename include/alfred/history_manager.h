// ============================================================================
// history_manager.h - Gestor de historial Q&A con similitud
// ============================================================================
// Equivalente a: OldProject/backend/core/functionsToHistory.py
// Busqueda de historial basada en keywords con scoring:
//   40% Jaccard similarity
//   + bonus por keywords de alta prioridad (RFC, CURP, NSS, nombre, etc.)
//   + bonus por datos personales y fuentes
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <optional>
#include "alfred/db_manager.h"

namespace alfred {

struct HistorySearchResult {
    QAHistoryEntry entry;
    float score = 0.0f;
};

class HistoryManager {
public:
    static HistoryManager& instance();

    // Guardar par Q&A en historial
    void save(const std::string& question, const std::string& answer,
              const std::string& personal_data = "",
              const std::string& sources = "");

    // Buscar en historial por similitud de keywords
    // threshold: minimo score (0.0-1.0), top_k: max resultados
    std::vector<HistorySearchResult> search(const std::string& question,
                                             float threshold = 0.3f,
                                             int top_k = 3);

    // Listar historial paginado
    std::vector<QAHistoryEntry> list(int limit = 100, int offset = 0);

    // Eliminar entrada por timestamp
    void remove(const std::string& timestamp);

    // Estadisticas
    nlohmann::json stats();

private:
    HistoryManager() = default;

    // Calcular score de similitud entre pregunta y entrada del historial
    float calculate_similarity_score(const std::string& query,
                                      const QAHistoryEntry& entry);
};

} // namespace alfred
