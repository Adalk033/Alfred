// ============================================================================
// token_accountant.cpp
// ============================================================================
#include "alfred/token_accountant.h"

#include "alfred/db_manager.h"
#include "alfred/llm_engine.h"

#include <functional>

namespace alfred {

TokenAccountant& TokenAccountant::instance() {
    static TokenAccountant inst;
    return inst;
}

size_t TokenAccountant::hash_key(const std::string& role,
                                 const std::string& content) const {
    // FNV-like combine sobre role + '\0' + content
    std::hash<std::string> h;
    size_t a = h(role);
    size_t b = h(content);
    return a ^ (b + 0x9e3779b97f4a7c15ULL + (a << 6) + (a >> 2));
}

void TokenAccountant::touch(size_t key) {
    auto it = cache_.find(key);
    if (it == cache_.end()) return;
    lru_.erase(it->second.lru_it);
    lru_.push_front(key);
    it->second.lru_it = lru_.begin();
}

void TokenAccountant::evict_if_needed() {
    while (cache_.size() > MAX_ENTRIES && !lru_.empty()) {
        size_t victim = lru_.back();
        lru_.pop_back();
        cache_.erase(victim);
    }
}

int TokenAccountant::count_cached(LLMEngine& llm, const std::string& role,
                                  const std::string& content) {
    if (content.empty()) return 0;
    const size_t key = hash_key(role, content);

    {
        std::lock_guard<std::mutex> lk(m_);
        auto it = cache_.find(key);
        if (it != cache_.end()) {
            touch(key);
            return it->second.tokens;
        }
    }

    // Tokenizar fuera del lock (puede ser costoso).
    int n = llm.count_tokens(content);
    if (n < 0) return 0;   // modelo no cargado: no podemos estimar fielmente

    std::lock_guard<std::mutex> lk(m_);
    auto [it, inserted] = cache_.try_emplace(key, Entry{n, lru_.end()});
    if (inserted) {
        lru_.push_front(key);
        it->second.lru_it = lru_.begin();
        evict_if_needed();
    } else {
        touch(key);
        it->second.tokens = n;
    }
    return n;
}

TokenBudget TokenAccountant::compute(
    LLMEngine& llm,
    int context_max,
    int reserved_for_reply,
    const std::string& system_prompt,
    const std::vector<ConversationMessage>& history,
    const std::string& tools_text,
    const std::vector<FileTokenInfo>& files,
    const std::string& draft_user_text)
{
    TokenBudget b;
    b.max_tokens_contexto              = context_max;
    b.tokens_reservados_para_respuesta = reserved_for_reply;

    b.breakdown.system = count_cached(llm, "system", system_prompt);

    for (const auto& m : history) {
        int n = count_cached(llm, m.role, m.content);
        if (m.role == "user") {
            b.breakdown.user_messages += n;
        } else if (m.role == "assistant") {
            b.breakdown.assistant_messages += n;
        } else if (m.role == "tool" || m.role == "tool_call" ||
                   m.role == "tool_result") {
            b.breakdown.tools += n;
        } else {
            // role desconocido: contabilizar como user por conservadurismo
            b.breakdown.user_messages += n;
        }
    }

    b.breakdown.tools += count_cached(llm, "tools", tools_text);

    for (const auto& f : files) {
        // Asumimos que el tokens ya viene calculado durante la extraccion.
        // Si viene en 0, lo ignoramos para no engañar al medidor.
        b.breakdown.files += f.tokens;
    }

    // Draft (texto que el usuario esta escribiendo) cuenta como user pero
    // sin cachear (cambia en cada keystroke).
    if (!draft_user_text.empty()) {
        int n = llm.count_tokens(draft_user_text);
        if (n > 0) b.breakdown.user_messages += n;
    }

    b.total_tokens_usados = b.breakdown.total();
    if (context_max > 0) {
        // Predictivo: cuenta tambien los tokens reservados para respuesta
        // para que la barra anticipe cuando ya no queda espacio.
        double used = static_cast<double>(b.total_tokens_usados +
                                          b.tokens_reservados_para_respuesta);
        b.porcentaje_usado = 100.0 * used / static_cast<double>(context_max);
        if (b.porcentaje_usado > 100.0) b.porcentaje_usado = 100.0;
    }
    return b;
}

void TokenAccountant::clear() {
    std::lock_guard<std::mutex> lk(m_);
    cache_.clear();
    lru_.clear();
}

void TokenAccountant::invalidate_conversation(const std::string&) {
    // Conservador: no rastreamos conv_id -> keys, asi que invalidamos todo.
    clear();
}

} // namespace alfred
