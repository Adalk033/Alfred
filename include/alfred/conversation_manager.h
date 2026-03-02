// ============================================================================
// conversation_manager.h - Gestor de conversaciones
// ============================================================================
// Equivalente a: OldProject/backend/core/conversation_manager.py
// Capa de abstraccion sobre DBManager para operaciones de conversaciones.
// Gestiona hilos de conversacion con mensajes user/assistant.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <optional>
#include "alfred/db_manager.h"

namespace alfred {

class ConversationManager {
public:
    static ConversationManager& instance();

    // Crear nueva conversacion, retorna UUID
    std::string create_conversation(const std::string& title = "Nueva conversacion");

    // Obtener conversacion por ID
    std::optional<ConversationThread> get_conversation(const std::string& id);

    // Listar conversaciones
    std::vector<ConversationThread> list_conversations(int limit = 50, int offset = 0);

    // Agregar mensaje a conversacion
    void add_message(const std::string& conversation_id,
                     const std::string& role,
                     const std::string& content,
                     const std::string& metadata = "");

    // Obtener historial de conversacion (ultimos N mensajes)
    std::vector<ConversationMessage> get_history(const std::string& conversation_id,
                                                  int max_messages = 50);

    // Actualizar titulo
    void update_title(const std::string& id, const std::string& title);

    // Limpiar mensajes de una conversacion
    void clear_messages(const std::string& id);

    // Eliminar conversacion completa
    void delete_conversation(const std::string& id);

    // Buscar conversaciones
    std::vector<ConversationThread> search(const std::string& query);

    // Metadata
    std::optional<std::string> get_metadata(const std::string& id);
    void update_metadata(const std::string& id, const std::string& metadata);

    // Formatear historial como contexto para el prompt
    std::string format_history_as_context(const std::string& conversation_id,
                                           int max_messages = 50);

private:
    ConversationManager() = default;
};

} // namespace alfred
