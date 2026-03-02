// ============================================================================
// db_manager.cpp - Gestor de base de datos SQLite
// ============================================================================
#include "alfred/db_manager.h"
#include "alfred/encryption.h"
#include "alfred/string_utils.h"
#include "alfred/logger.h"

#include <SQLiteCpp/SQLiteCpp.h>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <unordered_set>
#include <memory>

namespace alfred {

// Campos sensibles de usuario que se encriptan
const std::unordered_set<std::string> DBManager::SENSITIVE_USER_SETTINGS = {
    "user_name", "user_age", "profile_picture"
};

// Instancia global de la base de datos
static std::unique_ptr<SQLite::Database> g_db;

static std::string current_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

DBManager& DBManager::instance() {
    static DBManager mgr;
    return mgr;
}

void DBManager::initialize(const std::string& db_path) {
    if (initialized_) return;
    db_path_ = db_path;

    log_info("Inicializando base de datos: " + db_path);

    try {
        g_db = std::make_unique<SQLite::Database>(
            db_path, SQLite::OPEN_READWRITE | SQLite::OPEN_CREATE);

        // WAL mode para mejor rendimiento concurrente
        g_db->exec("PRAGMA journal_mode=WAL");
        g_db->exec("PRAGMA foreign_keys=ON");

        create_tables();
        run_migrations();

        initialized_ = true;
        log_info("Base de datos inicializada correctamente");
    } catch (const SQLite::Exception& e) {
        log_error("Error inicializando DB: " + std::string(e.what()));
        throw;
    }
}

void DBManager::create_tables() {
    // Hilos de conversacion
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS conversation_threads (
            id TEXT PRIMARY KEY,
            title TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            metadata TEXT DEFAULT '{}'
        )
    )");

    // Mensajes de conversacion
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS conversation_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            FOREIGN KEY (conversation_id) REFERENCES conversation_threads(id) ON DELETE CASCADE
        )
    )");

    // Historial Q&A
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS qa_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            personal_data TEXT DEFAULT '',
            sources TEXT DEFAULT '[]',
            timestamp TEXT NOT NULL
        )
    )");

    // Memoria key-value
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS memory (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    )");

    // Configuracion de usuario
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    )");

    // Configuracion de modelos
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS model_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    )");

    // Rutas de documentos
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS document_paths (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            enabled INTEGER DEFAULT 1,
            documents_count INTEGER DEFAULT 0,
            added_at TEXT NOT NULL
        )
    )");

    // Metadatos de documentos indexados
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS documents_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            file_hash TEXT NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'indexed',
            indexed_at TEXT NOT NULL
        )
    )");

    // Settings de aplicacion
    g_db->exec(R"(
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    )");

    // Indices
    g_db->exec("CREATE INDEX IF NOT EXISTS idx_messages_conv ON conversation_messages(conversation_id)");
    g_db->exec("CREATE INDEX IF NOT EXISTS idx_messages_ts ON conversation_messages(timestamp)");
    g_db->exec("CREATE INDEX IF NOT EXISTS idx_qa_ts ON qa_history(timestamp)");
    g_db->exec("CREATE INDEX IF NOT EXISTS idx_docs_path ON documents_meta(file_path)");

    log_debug("Tablas de base de datos creadas/verificadas");
}

void DBManager::run_migrations() {
    // Placeholder para migraciones futuras
    log_debug("Migraciones de DB completadas");
}

// ============================================================================
// Conversaciones
// ============================================================================
std::string DBManager::create_conversation(const std::string& title) {
    std::string id = generate_uuid();
    std::string now = current_timestamp();

    SQLite::Statement query(*g_db,
        "INSERT INTO conversation_threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)");
    query.bind(1, id);
    query.bind(2, title);
    query.bind(3, now);
    query.bind(4, now);
    query.exec();

    return id;
}

std::optional<ConversationThread> DBManager::get_conversation(const std::string& id) {
    SQLite::Statement query(*g_db,
        "SELECT id, title, created_at, updated_at, metadata FROM conversation_threads WHERE id = ?");
    query.bind(1, id);

    if (query.executeStep()) {
        ConversationThread thread;
        thread.id = query.getColumn(0).getString();
        thread.title = query.getColumn(1).getString();
        thread.created_at = query.getColumn(2).getString();
        thread.updated_at = query.getColumn(3).getString();
        thread.metadata = query.getColumn(4).getString();
        return thread;
    }
    return std::nullopt;
}

std::vector<ConversationThread> DBManager::list_conversations(int limit, int offset) {
    std::vector<ConversationThread> result;
    SQLite::Statement query(*g_db,
        "SELECT id, title, created_at, updated_at, metadata "
        "FROM conversation_threads ORDER BY updated_at DESC LIMIT ? OFFSET ?");
    query.bind(1, limit);
    query.bind(2, offset);

    while (query.executeStep()) {
        ConversationThread thread;
        thread.id = query.getColumn(0).getString();
        thread.title = query.getColumn(1).getString();
        thread.created_at = query.getColumn(2).getString();
        thread.updated_at = query.getColumn(3).getString();
        thread.metadata = query.getColumn(4).getString();
        result.push_back(std::move(thread));
    }
    return result;
}

void DBManager::update_conversation_title(const std::string& id, const std::string& title) {
    SQLite::Statement query(*g_db,
        "UPDATE conversation_threads SET title = ?, updated_at = ? WHERE id = ?");
    query.bind(1, title);
    query.bind(2, current_timestamp());
    query.bind(3, id);
    query.exec();
}

void DBManager::delete_conversation(const std::string& id) {
    // CASCADE eliminara mensajes automaticamente
    SQLite::Statement query(*g_db, "DELETE FROM conversation_threads WHERE id = ?");
    query.bind(1, id);
    query.exec();
}

void DBManager::add_message(const std::string& conversation_id, const std::string& role,
                             const std::string& content, const std::string& metadata) {
    auto& enc = Encryption::instance();
    std::string enc_content = enc.encrypt_if_enabled(content);

    SQLite::Statement query(*g_db,
        "INSERT INTO conversation_messages (conversation_id, role, content, timestamp, metadata) "
        "VALUES (?, ?, ?, ?, ?)");
    query.bind(1, conversation_id);
    query.bind(2, role);
    query.bind(3, enc_content);
    query.bind(4, current_timestamp());
    query.bind(5, metadata);
    query.exec();

    // Actualizar timestamp del hilo
    SQLite::Statement update(*g_db,
        "UPDATE conversation_threads SET updated_at = ? WHERE id = ?");
    update.bind(1, current_timestamp());
    update.bind(2, conversation_id);
    update.exec();
}

std::vector<ConversationMessage> DBManager::get_messages(const std::string& conversation_id,
                                                          int limit) {
    auto& enc = Encryption::instance();
    std::vector<ConversationMessage> result;

    SQLite::Statement query(*g_db,
        "SELECT id, conversation_id, role, content, timestamp, metadata "
        "FROM conversation_messages WHERE conversation_id = ? "
        "ORDER BY timestamp DESC LIMIT ?");
    query.bind(1, conversation_id);
    query.bind(2, limit);

    while (query.executeStep()) {
        ConversationMessage msg;
        msg.id = query.getColumn(0).getInt64();
        msg.conversation_id = query.getColumn(1).getString();
        msg.role = query.getColumn(2).getString();
        msg.content = enc.decrypt_if_enabled(query.getColumn(3).getString());
        msg.timestamp = query.getColumn(4).getString();
        msg.metadata = query.getColumn(5).getString();
        result.push_back(std::move(msg));
    }

    // Invertir para orden cronologico
    std::reverse(result.begin(), result.end());
    return result;
}

void DBManager::clear_messages(const std::string& conversation_id) {
    SQLite::Statement query(*g_db,
        "DELETE FROM conversation_messages WHERE conversation_id = ?");
    query.bind(1, conversation_id);
    query.exec();
}

std::vector<ConversationThread> DBManager::search_conversations(const std::string& query_str) {
    std::vector<ConversationThread> result;
    SQLite::Statement query(*g_db,
        "SELECT DISTINCT t.id, t.title, t.created_at, t.updated_at, t.metadata "
        "FROM conversation_threads t "
        "LEFT JOIN conversation_messages m ON t.id = m.conversation_id "
        "WHERE t.title LIKE ? OR m.content LIKE ? "
        "ORDER BY t.updated_at DESC LIMIT 50");

    std::string search = "%" + query_str + "%";
    query.bind(1, search);
    query.bind(2, search);

    while (query.executeStep()) {
        ConversationThread thread;
        thread.id = query.getColumn(0).getString();
        thread.title = query.getColumn(1).getString();
        thread.created_at = query.getColumn(2).getString();
        thread.updated_at = query.getColumn(3).getString();
        thread.metadata = query.getColumn(4).getString();
        result.push_back(std::move(thread));
    }
    return result;
}

std::optional<std::string> DBManager::get_conversation_metadata(const std::string& id) {
    SQLite::Statement query(*g_db,
        "SELECT metadata FROM conversation_threads WHERE id = ?");
    query.bind(1, id);
    if (query.executeStep()) {
        return query.getColumn(0).getString();
    }
    return std::nullopt;
}

void DBManager::update_conversation_metadata(const std::string& id, const std::string& metadata) {
    SQLite::Statement query(*g_db,
        "UPDATE conversation_threads SET metadata = ?, updated_at = ? WHERE id = ?");
    query.bind(1, metadata);
    query.bind(2, current_timestamp());
    query.bind(3, id);
    query.exec();
}

// ============================================================================
// Historial Q&A
// ============================================================================
void DBManager::insert_qa_history(const std::string& question, const std::string& answer,
                                   const std::string& personal_data, const std::string& sources) {
    auto& enc = Encryption::instance();

    SQLite::Statement query(*g_db,
        "INSERT INTO qa_history (question, answer, personal_data, sources, timestamp) "
        "VALUES (?, ?, ?, ?, ?)");
    query.bind(1, enc.encrypt_if_enabled(question));
    query.bind(2, enc.encrypt_if_enabled(answer));
    query.bind(3, enc.encrypt_if_enabled(personal_data));
    query.bind(4, enc.encrypt_if_enabled(sources));
    query.bind(5, current_timestamp());
    query.exec();
}

std::vector<QAHistoryEntry> DBManager::get_qa_history(int limit, int offset) {
    auto& enc = Encryption::instance();
    std::vector<QAHistoryEntry> result;

    SQLite::Statement query(*g_db,
        "SELECT id, question, answer, personal_data, sources, timestamp "
        "FROM qa_history ORDER BY timestamp DESC LIMIT ? OFFSET ?");
    query.bind(1, limit);
    query.bind(2, offset);

    while (query.executeStep()) {
        QAHistoryEntry entry;
        entry.id = query.getColumn(0).getInt64();
        entry.question = enc.decrypt_if_enabled(query.getColumn(1).getString());
        entry.answer = enc.decrypt_if_enabled(query.getColumn(2).getString());
        entry.personal_data = enc.decrypt_if_enabled(query.getColumn(3).getString());
        entry.sources = enc.decrypt_if_enabled(query.getColumn(4).getString());
        entry.timestamp = query.getColumn(5).getString();
        result.push_back(std::move(entry));
    }
    return result;
}

std::vector<QAHistoryEntry> DBManager::search_qa_history(const std::string& query_str) {
    // Cargamos todo y filtramos en memoria (datos estan encriptados en DB)
    auto all = get_qa_history(500, 0);
    std::vector<QAHistoryEntry> result;
    std::string lower_query = to_lower(query_str);

    for (auto& entry : all) {
        if (to_lower(entry.question).find(lower_query) != std::string::npos ||
            to_lower(entry.answer).find(lower_query) != std::string::npos) {
            result.push_back(std::move(entry));
        }
    }
    return result;
}

void DBManager::delete_qa_history(const std::string& timestamp) {
    SQLite::Statement query(*g_db, "DELETE FROM qa_history WHERE timestamp = ?");
    query.bind(1, timestamp);
    query.exec();
}

json DBManager::get_qa_history_stats() {
    json stats;
    SQLite::Statement query(*g_db, "SELECT COUNT(*) FROM qa_history");
    if (query.executeStep()) {
        stats["total_entries"] = query.getColumn(0).getInt();
    }
    return stats;
}

// ============================================================================
// Memoria key-value
// ============================================================================
void DBManager::set_memory(const std::string& key, const std::string& value) {
    auto& enc = Encryption::instance();
    SQLite::Statement query(*g_db,
        "INSERT OR REPLACE INTO memory (key, value) VALUES (?, ?)");
    query.bind(1, enc.encrypt_if_enabled(key));
    query.bind(2, enc.encrypt_if_enabled(value));
    query.exec();
}

std::optional<std::string> DBManager::get_memory(const std::string& key) {
    auto& enc = Encryption::instance();
    // Buscar encriptado
    std::string enc_key = enc.encrypt_if_enabled(key);
    SQLite::Statement query(*g_db, "SELECT value FROM memory WHERE key = ?");
    query.bind(1, enc_key);
    if (query.executeStep()) {
        return enc.decrypt_if_enabled(query.getColumn(0).getString());
    }
    return std::nullopt;
}

std::unordered_map<std::string, std::string> DBManager::get_all_memory() {
    auto& enc = Encryption::instance();
    std::unordered_map<std::string, std::string> result;
    SQLite::Statement query(*g_db, "SELECT key, value FROM memory");
    while (query.executeStep()) {
        std::string k = enc.decrypt_if_enabled(query.getColumn(0).getString());
        std::string v = enc.decrypt_if_enabled(query.getColumn(1).getString());
        result[k] = v;
    }
    return result;
}

void DBManager::delete_memory(const std::string& key) {
    auto& enc = Encryption::instance();
    SQLite::Statement query(*g_db, "DELETE FROM memory WHERE key = ?");
    query.bind(1, enc.encrypt_if_enabled(key));
    query.exec();
}

// ============================================================================
// Configuracion de usuario
// ============================================================================
void DBManager::set_user_setting(const std::string& key, const std::string& value) {
    auto& enc = Encryption::instance();
    bool is_sensitive = SENSITIVE_USER_SETTINGS.count(key) > 0;
    std::string stored_value = is_sensitive ? enc.encrypt_if_enabled(value) : value;

    SQLite::Statement query(*g_db,
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)");
    query.bind(1, key);
    query.bind(2, stored_value);
    query.exec();
}

std::optional<std::string> DBManager::get_user_setting(const std::string& key) {
    auto& enc = Encryption::instance();
    SQLite::Statement query(*g_db, "SELECT value FROM user_settings WHERE key = ?");
    query.bind(1, key);
    if (query.executeStep()) {
        std::string value = query.getColumn(0).getString();
        bool is_sensitive = SENSITIVE_USER_SETTINGS.count(key) > 0;
        return is_sensitive ? enc.decrypt_if_enabled(value) : value;
    }
    return std::nullopt;
}

std::unordered_map<std::string, std::string> DBManager::get_all_user_settings() {
    auto& enc = Encryption::instance();
    std::unordered_map<std::string, std::string> result;
    SQLite::Statement query(*g_db, "SELECT key, value FROM user_settings");
    while (query.executeStep()) {
        std::string key = query.getColumn(0).getString();
        std::string value = query.getColumn(1).getString();
        bool is_sensitive = SENSITIVE_USER_SETTINGS.count(key) > 0;
        result[key] = is_sensitive ? enc.decrypt_if_enabled(value) : value;
    }
    return result;
}

void DBManager::delete_user_setting(const std::string& key) {
    SQLite::Statement query(*g_db, "DELETE FROM user_settings WHERE key = ?");
    query.bind(1, key);
    query.exec();
}

// ============================================================================
// Configuracion de modelos (NO encriptada)
// ============================================================================
void DBManager::set_model_setting(const std::string& key, const std::string& value) {
    SQLite::Statement query(*g_db,
        "INSERT OR REPLACE INTO model_settings (key, value) VALUES (?, ?)");
    query.bind(1, key);
    query.bind(2, value);
    query.exec();
}

std::optional<std::string> DBManager::get_model_setting(const std::string& key) {
    SQLite::Statement query(*g_db, "SELECT value FROM model_settings WHERE key = ?");
    query.bind(1, key);
    if (query.executeStep()) {
        return query.getColumn(0).getString();
    }
    return std::nullopt;
}

std::unordered_map<std::string, std::string> DBManager::get_all_model_settings() {
    std::unordered_map<std::string, std::string> result;
    SQLite::Statement query(*g_db, "SELECT key, value FROM model_settings");
    while (query.executeStep()) {
        result[query.getColumn(0).getString()] = query.getColumn(1).getString();
    }
    return result;
}

// ============================================================================
// Rutas de documentos
// ============================================================================
int64_t DBManager::add_document_path(const std::string& path) {
    SQLite::Statement query(*g_db,
        "INSERT OR IGNORE INTO document_paths (path, added_at) VALUES (?, ?)");
    query.bind(1, path);
    query.bind(2, current_timestamp());
    query.exec();
    return g_db->getLastInsertRowid();
}

std::vector<DocumentPath> DBManager::get_document_paths() {
    std::vector<DocumentPath> result;
    SQLite::Statement query(*g_db,
        "SELECT id, path, enabled, documents_count, added_at FROM document_paths ORDER BY added_at");
    while (query.executeStep()) {
        DocumentPath dp;
        dp.id = query.getColumn(0).getInt64();
        dp.path = query.getColumn(1).getString();
        dp.enabled = query.getColumn(2).getInt() != 0;
        dp.documents_count = query.getColumn(3).getInt();
        dp.added_at = query.getColumn(4).getString();
        result.push_back(std::move(dp));
    }
    return result;
}

void DBManager::update_document_path(int64_t id, bool enabled) {
    SQLite::Statement query(*g_db,
        "UPDATE document_paths SET enabled = ? WHERE id = ?");
    query.bind(1, enabled ? 1 : 0);
    query.bind(2, id);
    query.exec();
}

void DBManager::delete_document_path(int64_t id) {
    SQLite::Statement query(*g_db, "DELETE FROM document_paths WHERE id = ?");
    query.bind(1, id);
    query.exec();
}

// ============================================================================
// Metadatos de documentos
// ============================================================================
void DBManager::insert_document_meta(const std::string& file_path,
                                      const std::string& file_hash, int chunk_count) {
    SQLite::Statement query(*g_db,
        "INSERT OR REPLACE INTO documents_meta (file_path, file_hash, chunk_count, status, indexed_at) "
        "VALUES (?, ?, ?, 'indexed', ?)");
    query.bind(1, file_path);
    query.bind(2, file_hash);
    query.bind(3, chunk_count);
    query.bind(4, current_timestamp());
    query.exec();
}

std::unordered_map<std::string, std::string> DBManager::get_all_document_hashes() {
    std::unordered_map<std::string, std::string> result;
    SQLite::Statement query(*g_db,
        "SELECT file_path, file_hash FROM documents_meta WHERE status = 'indexed'");
    while (query.executeStep()) {
        result[query.getColumn(0).getString()] = query.getColumn(1).getString();
    }
    return result;
}

void DBManager::delete_document_meta(const std::string& file_path) {
    SQLite::Statement query(*g_db, "DELETE FROM documents_meta WHERE file_path = ?");
    query.bind(1, file_path);
    query.exec();
}

void DBManager::update_document_status(const std::string& file_path, const std::string& status) {
    SQLite::Statement query(*g_db,
        "UPDATE documents_meta SET status = ? WHERE file_path = ?");
    query.bind(1, status);
    query.bind(2, file_path);
    query.exec();
}

json DBManager::get_document_stats() {
    json stats;

    SQLite::Statement total_q(*g_db, "SELECT COUNT(*) FROM documents_meta WHERE status = 'indexed'");
    if (total_q.executeStep()) stats["total_documents"] = total_q.getColumn(0).getInt();

    SQLite::Statement chunks_q(*g_db, "SELECT SUM(chunk_count) FROM documents_meta WHERE status = 'indexed'");
    if (chunks_q.executeStep()) stats["total_chunks"] = chunks_q.getColumn(0).getInt();

    SQLite::Statement paths_q(*g_db, "SELECT COUNT(*) FROM document_paths WHERE enabled = 1");
    if (paths_q.executeStep()) stats["active_paths"] = paths_q.getColumn(0).getInt();

    return stats;
}

// ============================================================================
// Settings de app
// ============================================================================
void DBManager::set_app_setting(const std::string& key, const std::string& value) {
    SQLite::Statement query(*g_db,
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
    query.bind(1, key);
    query.bind(2, value);
    query.exec();
}

std::optional<std::string> DBManager::get_app_setting(const std::string& key) {
    SQLite::Statement query(*g_db, "SELECT value FROM app_settings WHERE key = ?");
    query.bind(1, key);
    if (query.executeStep()) {
        return query.getColumn(0).getString();
    }
    return std::nullopt;
}

} // namespace alfred
