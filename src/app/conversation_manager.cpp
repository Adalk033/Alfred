// ============================================================================
// conversation_manager.cpp - Gestor de conversaciones
// ============================================================================
#include "alfred/conversation_manager.h"
#include "alfred/string_utils.h"
#include "alfred/llm_engine.h"

#include <sstream>
#include <algorithm>

namespace alfred {

ConversationManager& ConversationManager::instance() {
    static ConversationManager mgr;
    return mgr;
}

std::string ConversationManager::create_conversation(const std::string& title) {
    return DBManager::instance().create_conversation(title);
}

std::optional<ConversationThread> ConversationManager::get_conversation(const std::string& id) {
    return DBManager::instance().get_conversation(id);
}

std::vector<ConversationThread> ConversationManager::list_conversations(int limit, int offset) {
    return DBManager::instance().list_conversations(limit, offset);
}

void ConversationManager::add_message(const std::string& conversation_id,
                                       const std::string& role,
                                       const std::string& content,
                                       const std::string& metadata) {
    DBManager::instance().add_message(conversation_id, role, content, metadata);
}

std::vector<ConversationMessage> ConversationManager::get_history(
    const std::string& conversation_id, int max_messages) {
    return DBManager::instance().get_messages(conversation_id, max_messages);
}

void ConversationManager::update_title(const std::string& id, const std::string& title) {
    DBManager::instance().update_conversation_title(id, title);
}

void ConversationManager::clear_messages(const std::string& id) {
    DBManager::instance().clear_messages(id);
}

void ConversationManager::delete_conversation(const std::string& id) {
    DBManager::instance().delete_conversation(id);
}

int ConversationManager::delete_conversations(const std::vector<std::string>& ids) {
    return DBManager::instance().delete_conversations(ids);
}

std::vector<ConversationThread> ConversationManager::search(const std::string& query) {
    return DBManager::instance().search_conversations(query);
}

std::optional<std::string> ConversationManager::get_metadata(const std::string& id) {
    return DBManager::instance().get_conversation_metadata(id);
}

void ConversationManager::update_metadata(const std::string& id, const std::string& metadata) {
    DBManager::instance().update_conversation_metadata(id, metadata);
}

std::string ConversationManager::format_history_as_context(
    const std::string& conversation_id, int max_messages) {
    auto messages = get_history(conversation_id, max_messages);
    return format_messages_as_context(messages);
}

std::string ConversationManager::format_messages_as_context(
    const std::vector<ConversationMessage>& messages) {
    if (messages.empty()) return "";

    std::ostringstream oss;
    oss << "Historial de conversacion reciente:\n";
    for (const auto& msg : messages) {
        if (msg.role == "user") {
            oss << "Usuario: " << msg.content << "\n";
        } else {
            oss << "Alfred: " << truncate(msg.content, 500) << "\n";
        }
    }
    return oss.str();
}

std::vector<ConversationMessage> ConversationManager::select_history_within_budget(
    const std::string& conversation_id, LLMEngine& llm, int token_budget) {
    if (token_budget <= 0) return {};

    // Leer un lote amplio y truncar por tokens desde el mas reciente hacia atras.
    auto msgs = DBManager::instance().get_messages(conversation_id, 500);
    if (msgs.empty()) return {};

    std::vector<ConversationMessage> kept;
    kept.reserve(msgs.size());

    int used = 0;
    for (auto it = msgs.rbegin(); it != msgs.rend(); ++it) {
        const auto& m = *it;
        const std::string prefix = (m.role == "user") ? "Usuario: " : "Alfred: ";
        const std::string& body  = (m.role == "user") ? m.content : truncate(m.content, 500);
        std::string line = prefix + body + "\n";

        int cost = llm.count_tokens(line);
        if (cost < 0) cost = static_cast<int>(line.size()) / 4;   // fallback heuristico

        if (used + cost > token_budget) break;
        used += cost;
        kept.push_back(m);
    }

    std::reverse(kept.begin(), kept.end());
    return kept;
}

} // namespace alfred
