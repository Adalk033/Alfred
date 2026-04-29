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

class LLMEngine;

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
    int delete_conversations(const std::vector<std::string>& ids);

    // Buscar conversaciones
    std::vector<ConversationThread> search(const std::string& query);

    // Metadata
    std::optional<std::string> get_metadata(const std::string& id);
    void update_metadata(const std::string& id, const std::string& metadata);

    // Formatear historial como contexto para el prompt
    std::string format_history_as_context(const std::string& conversation_id,
                                           int max_messages = 50);

    // Selecciona los mensajes mas recientes que caben dentro de `token_budget`,
    // usando el tokenizer real del modelo cargado. Si el modelo no esta cargado
    // o count_tokens retorna -1, aplica fallback heuristico (1 token ~ 4 chars).
    // Retorna los mensajes en orden cronologico.
    std::vector<ConversationMessage> select_history_within_budget(
        const std::string& conversation_id,
        LLMEngine& llm,
        int token_budget);

    // Formatea un vector de mensajes ya seleccionado como bloque de contexto
    // textual para inyectar en el prompt. Util cuando el filtrado (por tokens
    // u otro criterio) ocurre fuera de esta clase.
    static std::string format_messages_as_context(
        const std::vector<ConversationMessage>& messages);

private:
    ConversationManager() = default;
};

} // namespace alfred
