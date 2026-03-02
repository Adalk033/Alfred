// ============================================================================
// history_manager.cpp - Gestor de historial Q&A con similitud
// ============================================================================
// Scoring de similitud (normalizado 0-1):
//   40% Jaccard similarity de keywords
//   + 0.25 por cada keyword de alta prioridad encontrada
//   + 0.15 por match exacto de keywords prioritarias
//   + 0.10 si tiene datos personales
//   + 0.05 si tiene fuentes
//   + 20% score de especificidad
// ============================================================================
#include "alfred/history_manager.h"
#include "alfred/string_utils.h"
#include "alfred/logger.h"

#include <algorithm>
#include <unordered_set>

namespace alfred {

// Keywords de alta prioridad
static const std::unordered_set<std::string> HIGH_PRIORITY_KEYWORDS = {
    "rfc", "curp", "nss", "nombre", "apellido", "direccion",
    "telefono", "correo", "email", "fecha", "nacimiento",
    "salario", "sueldo", "cuenta", "banco", "contrato"
};

// Palabras de consulta a ignorar
static const std::unordered_set<std::string> QUERY_WORDS = {
    "cual", "que", "donde", "cuando", "como", "quien",
    "cuanto", "dime", "dame", "busca", "encuentra",
    "muestra", "necesito", "quiero", "puedes"
};

HistoryManager& HistoryManager::instance() {
    static HistoryManager mgr;
    return mgr;
}

void HistoryManager::save(const std::string& question, const std::string& answer,
                           const std::string& personal_data, const std::string& sources) {
    DBManager::instance().insert_qa_history(question, answer, personal_data, sources);
}

float HistoryManager::calculate_similarity_score(const std::string& query,
                                                   const QAHistoryEntry& entry) {
    // Extraer keywords de la consulta (filtrar query words)
    auto raw_keywords = extract_keywords(query, 3);
    std::vector<std::string> query_keywords;
    for (const auto& kw : raw_keywords) {
        if (QUERY_WORDS.find(kw) == QUERY_WORDS.end()) {
            query_keywords.push_back(kw);
        }
    }

    if (query_keywords.empty()) return 0.0f;

    // Extraer keywords del historial (pregunta + respuesta)
    auto question_kw = extract_keywords(entry.question, 3);
    auto answer_kw = extract_keywords(entry.answer, 3);

    // Combinar keywords del historial
    std::vector<std::string> content_keywords;
    content_keywords.insert(content_keywords.end(), question_kw.begin(), question_kw.end());
    content_keywords.insert(content_keywords.end(), answer_kw.begin(), answer_kw.end());

    // 1. Jaccard similarity (40%)
    float jaccard = jaccard_similarity(query_keywords, content_keywords);
    float score = jaccard * 0.4f;

    // 2. Bonus por keywords de alta prioridad
    std::unordered_set<std::string> content_set(content_keywords.begin(), content_keywords.end());
    for (const auto& kw : query_keywords) {
        if (HIGH_PRIORITY_KEYWORDS.count(kw)) {
            score += 0.25f; // Bonus por buscar keyword prioritaria
            if (content_set.count(kw)) {
                score += 0.15f; // Bonus extra por match exacto
            }
        }
    }

    // 3. Bonus por datos personales
    if (!entry.personal_data.empty() && entry.personal_data != "{}") {
        score += 0.10f;
    }

    // 4. Bonus por fuentes
    if (!entry.sources.empty() && entry.sources != "[]") {
        score += 0.05f;
    }

    // 5. Especificidad (20%)
    if (!content_keywords.empty()) {
        int common = 0;
        for (const auto& kw : query_keywords) {
            if (content_set.count(kw)) ++common;
        }
        float specificity = static_cast<float>(common) /
                            static_cast<float>(query_keywords.size());
        score += specificity * 0.2f;
    }

    // Normalizar a [0, 1]
    return std::min(1.0f, std::max(0.0f, score));
}

std::vector<HistorySearchResult> HistoryManager::search(const std::string& question,
                                                          float threshold, int top_k) {
    auto history = DBManager::instance().get_qa_history(500, 0);
    std::vector<HistorySearchResult> results;

    for (auto& entry : history) {
        float score = calculate_similarity_score(question, entry);
        if (score >= threshold) {
            results.push_back({std::move(entry), score});
        }
    }

    // Ordenar por score descendente
    std::sort(results.begin(), results.end(),
              [](const HistorySearchResult& a, const HistorySearchResult& b) {
                  return a.score > b.score;
              });

    // Limitar a top_k
    if (static_cast<int>(results.size()) > top_k) {
        results.resize(static_cast<size_t>(top_k));
    }

    return results;
}

std::vector<QAHistoryEntry> HistoryManager::list(int limit, int offset) {
    return DBManager::instance().get_qa_history(limit, offset);
}

void HistoryManager::remove(const std::string& timestamp) {
    DBManager::instance().delete_qa_history(timestamp);
}

json HistoryManager::stats() {
    return DBManager::instance().get_qa_history_stats();
}

} // namespace alfred
