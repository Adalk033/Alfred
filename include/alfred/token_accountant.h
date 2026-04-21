// ============================================================================
// token_accountant.h - Contabilizacion de tokens del contexto LLM
// ============================================================================
// Calcula el uso de tokens desglosado por seccion (system / user / assistant /
// tools / files) usando el tokenizer real del modelo cargado. Incluye un
// cache LRU por (role, content) para evitar tokenizar mensajes repetidamente.
//
// Thread-safe. Invalidar al cambiar de modelo (distinto tokenizer).
// ============================================================================
#pragma once

#include <cstddef>
#include <list>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include <nlohmann/json.hpp>

namespace alfred {

class LLMEngine;
struct ConversationMessage;

struct TokenBreakdown {
    int system             = 0;
    int user_messages      = 0;
    int assistant_messages = 0;
    int tools              = 0;
    int files              = 0;

    int total() const {
        return system + user_messages + assistant_messages + tools + files;
    }

    nlohmann::json to_json() const {
        return {
            {"system",             system},
            {"user_messages",      user_messages},
            {"assistant_messages", assistant_messages},
            {"tools",              tools},
            {"files",              files},
        };
    }
};

struct TokenBudget {
    int total_tokens_usados            = 0;
    int max_tokens_contexto            = 0;
    int tokens_reservados_para_respuesta = 0;
    double porcentaje_usado            = 0.0;
    TokenBreakdown breakdown;

    nlohmann::json to_json() const {
        return {
            {"total_tokens_usados",              total_tokens_usados},
            {"max_tokens_contexto",              max_tokens_contexto},
            {"tokens_reservados_para_respuesta", tokens_reservados_para_respuesta},
            {"porcentaje_usado",                 porcentaje_usado},
            {"breakdown",                        breakdown.to_json()},
        };
    }
};

struct FileTokenInfo {
    std::string filename;
    int tokens = 0;
};

class TokenAccountant {
public:
    static TokenAccountant& instance();

    // Cuenta tokens con cache LRU.
    int count_cached(LLMEngine& llm, const std::string& role,
                     const std::string& content);

    // Calcula desglose completo. Cualquier seccion puede venir vacia.
    TokenBudget compute(LLMEngine& llm,
                        int context_max,
                        int reserved_for_reply,
                        const std::string& system_prompt,
                        const std::vector<ConversationMessage>& history,
                        const std::string& tools_text,
                        const std::vector<FileTokenInfo>& files,
                        const std::string& draft_user_text);

    // Invalidar todo (al cambiar de modelo).
    void clear();

    // Invalidar entradas de una conversacion: como no tenemos mapping
    // conv_id -> hashes, este metodo hace clear completo. Es conservador.
    void invalidate_conversation(const std::string& conv_id);

private:
    TokenAccountant() = default;

    struct Entry {
        int tokens;
        std::list<size_t>::iterator lru_it;
    };

    static constexpr size_t MAX_ENTRIES = 4096;

    std::mutex m_;
    std::unordered_map<size_t, Entry> cache_;
    std::list<size_t> lru_;   // front = most recent

    size_t hash_key(const std::string& role, const std::string& content) const;
    void touch(size_t key);
    void evict_if_needed();
};

} // namespace alfred
