// ============================================================================
// conversation_manager.cpp - Gestor de conversaciones
// ============================================================================
#include "alfred/conversation_manager.h"
#include "alfred/string_utils.h"

#include <sstream>

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

} // namespace alfred
