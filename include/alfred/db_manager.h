// ============================================================================
// db_manager.h - Gestor de base de datos SQLite
// ============================================================================
// Gestiona: conversaciones, memoria, configuracion, metadatos de documentos.
// Datos sensibles se encriptan con AES-256-GCM.
// ============================================================================
#pragma once

#include <string>
#include <vector>
#include <optional>
#include <mutex>
#include <unordered_map>
#include <unordered_set>
#include <nlohmann/json.hpp>

namespace alfred {

using json = nlohmann::json;

struct ConversationThread {
    std::string id;
    std::string title;
    std::string created_at;
    std::string updated_at;
    std::string metadata;
};

struct ConversationMessage {
    int64_t id = 0;
    std::string conversation_id;
    std::string role;       // "user" o "assistant"
    std::string content;
    std::string timestamp;
    std::string metadata;
};

struct DocumentMeta {
    int64_t id = 0;
    std::string file_path;
    std::string file_hash;
    int chunk_count = 0;
    std::string status;     // "indexed", "deleted", "error"
    std::string indexed_at;
};

struct DocumentPath {
    int64_t id = 0;
    std::string path;
    bool enabled = true;
    int documents_count = 0;
    std::string added_at;
};

class DBManager {
public:
    static DBManager& instance();

    // Inicializar base de datos (crear tablas, migraciones)
    void initialize(const std::string& db_path);

    // --- Conversaciones ---
    std::string create_conversation(const std::string& title = "");
    std::optional<ConversationThread> get_conversation(const std::string& id);
    std::vector<ConversationThread> list_conversations(int limit = 50, int offset = 0);
    void update_conversation_title(const std::string& id, const std::string& title);
    void delete_conversation(const std::string& id);
    int delete_conversations(const std::vector<std::string>& ids);
    void add_message(const std::string& conversation_id, const std::string& role,
                     const std::string& content, const std::string& metadata = "");
    std::vector<ConversationMessage> get_messages(const std::string& conversation_id,
                                                   int limit = 50);
    void clear_messages(const std::string& conversation_id);
    std::vector<ConversationThread> search_conversations(const std::string& query);
    std::optional<std::string> get_conversation_metadata(const std::string& id);
    void update_conversation_metadata(const std::string& id, const std::string& metadata);

    // --- Memoria (key-value encriptado) ---
    void set_memory(const std::string& key, const std::string& value);
    std::optional<std::string> get_memory(const std::string& key);
    std::unordered_map<std::string, std::string> get_all_memory();
    void delete_memory(const std::string& key);

    // --- Configuracion de usuario ---
    void set_user_setting(const std::string& key, const std::string& value);
    std::optional<std::string> get_user_setting(const std::string& key);
    std::unordered_map<std::string, std::string> get_all_user_settings();
    void delete_user_setting(const std::string& key);

    // --- Configuracion de modelos ---
    void set_model_setting(const std::string& key, const std::string& value);
    std::optional<std::string> get_model_setting(const std::string& key);
    std::unordered_map<std::string, std::string> get_all_model_settings();

    // --- Rutas de documentos ---
    int64_t add_document_path(const std::string& path);
    std::vector<DocumentPath> get_document_paths();
    void update_document_path(int64_t id, bool enabled);
    void delete_document_path(int64_t id);

    // --- Metadatos de documentos ---
    void insert_document_meta(const std::string& file_path, const std::string& file_hash,
                               int chunk_count);
    std::unordered_map<std::string, std::string> get_all_document_hashes();
    void delete_document_meta(const std::string& file_path);
    void update_document_status(const std::string& file_path, const std::string& status);
    json get_document_stats();

    // --- Settings de app ---
    void set_app_setting(const std::string& key, const std::string& value);
    std::optional<std::string> get_app_setting(const std::string& key);

private:
    DBManager() = default;
    void create_tables();
    void run_migrations();

    // Serializa todo acceso a la conexion SQLite compartida: cpp-httplib
    // atiende cada request en su propio thread y una conexion SQLite no
    // admite uso concurrente (SQLITE_MISUSE / corrupcion).
    std::mutex db_mutex_;

    std::string db_path_;
    bool initialized_ = false;

    // Campos sensibles que requieren encriptacion
    static const std::unordered_set<std::string> SENSITIVE_USER_SETTINGS;
};

} // namespace alfred
