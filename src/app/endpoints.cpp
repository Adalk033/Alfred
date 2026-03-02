// ============================================================================
// endpoints.cpp - Handlers de endpoints HTTP REST
// ============================================================================
// Equivalente a: OldProject/backend/core/endpoints/*
// ============================================================================
#include "alfred/endpoints.h"
#include "alfred/alfred_core.h"
#include "alfred/db_manager.h"
#include "alfred/conversation_manager.h"
#include "alfred/history_manager.h"
#include "alfred/gpu_manager.h"
#include "alfred/encryption.h"
#include "alfred/config.h"
#include "alfred/paths.h"
#include "alfred/logger.h"
#include "alfred/string_utils.h"
#include "alfred/path_validator.h"

#include <nlohmann/json.hpp>
#include <filesystem>
#include <chrono>

namespace alfred {

using json = nlohmann::json;

// Helper: parsear JSON del body con manejo de errores
static bool parse_body(const httplib::Request& req, httplib::Response& res, json& out) {
    if (req.body.empty()) {
        res.status = 400;
        res.set_content(R"({"error":"Body vacio"})", "application/json");
        return false;
    }
    try {
        out = json::parse(req.body);
        return true;
    } catch (const json::parse_error& e) {
        res.status = 400;
        json err;
        err["error"] = std::string("JSON invalido: ") + e.what();
        res.set_content(err.dump(), "application/json");
        return false;
    }
}

// Helper: respuesta JSON exitosa
static void json_ok(httplib::Response& res, const json& data) {
    res.status = 200;
    res.set_content(data.dump(), "application/json");
}

// Helper: respuesta de error
static void json_error(httplib::Response& res, int status, const std::string& msg) {
    res.status = status;
    json err;
    err["error"] = msg;
    res.set_content(err.dump(), "application/json");
}

// Helper: extraer path param
static std::string path_param(const httplib::Request& req, const std::string& name) {
    auto it = req.path_params.find(name);
    if (it != req.path_params.end()) return it->second;
    return "";
}

// ============================================================================
// Root y salud
// ============================================================================
void handle_root(const httplib::Request& /*req*/, httplib::Response& res) {
    json data;
    data["name"] = "Alfred";
    data["version"] = "2.0.0";
    data["status"] = "running";
    data["engine"] = "llama.cpp + CUDA";
    json_ok(res, data);
}

void handle_health(const httplib::Request& /*req*/, httplib::Response& res,
                   AlfredCore& core) {
    json data;
    data["status"] = core.is_initialized() ? "healthy" : "initializing";
    data["stats"] = core.get_stats();
    json_ok(res, data);
}

// ============================================================================
// Query
// ============================================================================
void handle_query(const httplib::Request& req, httplib::Response& res,
                  AlfredCore& core) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string question = body.value("question", "");
    if (question.empty()) {
        json_error(res, 400, "Campo 'question' requerido");
        return;
    }

    bool use_history = body.value("use_history", true);
    bool search_documents = body.value("search_documents", true);

    log_info("Query: " + truncate(question, 80));

    auto result = core.query(question, use_history, search_documents);

    json data;
    data["answer"] = result.answer;
    data["sources"] = result.sources.empty() ? json(nullptr)
                      : json::parse(result.sources, nullptr, false);
    data["personal_data"] = result.personal_data.empty() ? json(nullptr)
                            : json::parse(result.personal_data, nullptr, false);
    data["from_cache"] = result.from_cache;
    data["from_history"] = result.from_history;
    data["time_ms"] = result.total_time_ms;
    json_ok(res, data);
}

// ============================================================================
// Conversaciones
// ============================================================================
void handle_create_conversation(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!req.body.empty()) {
        if (!parse_body(req, res, body)) return;
    }

    std::string title = body.is_null() ? "" : body.value("title", "");
    auto& cm = ConversationManager::instance();
    std::string id = cm.create_conversation(title);

    json data;
    data["id"] = id;
    data["title"] = title.empty() ? "Nueva conversacion" : title;
    res.status = 201;
    res.set_content(data.dump(), "application/json");
}

void handle_list_conversations(const httplib::Request& req, httplib::Response& res) {
    int limit = 50, offset = 0;
    if (req.has_param("limit")) limit = std::stoi(req.get_param_value("limit"));
    if (req.has_param("offset")) offset = std::stoi(req.get_param_value("offset"));

    auto conversations = ConversationManager::instance().list_conversations(limit, offset);

    json data = json::array();
    for (const auto& conv : conversations) {
        data.push_back({
            {"id", conv.id},
            {"title", conv.title},
            {"created_at", conv.created_at},
            {"updated_at", conv.updated_at}
        });
    }
    json_ok(res, data);
}

void handle_get_conversation(const httplib::Request& req, httplib::Response& res) {
    std::string id = path_param(req, "id");
    if (id.empty()) { json_error(res, 400, "ID requerido"); return; }

    auto conv = ConversationManager::instance().get_conversation(id);
    if (!conv) { json_error(res, 404, "Conversacion no encontrada"); return; }

    auto messages = ConversationManager::instance().get_history(id);

    json data;
    data["id"] = conv->id;
    data["title"] = conv->title;
    data["created_at"] = conv->created_at;
    data["updated_at"] = conv->updated_at;

    json msgs = json::array();
    for (const auto& m : messages) {
        msgs.push_back({
            {"id", m.id},
            {"role", m.role},
            {"content", m.content},
            {"timestamp", m.timestamp}
        });
    }
    data["messages"] = msgs;
    json_ok(res, data);
}

void handle_update_conversation_title(const httplib::Request& req, httplib::Response& res) {
    std::string id = path_param(req, "id");
    if (id.empty()) { json_error(res, 400, "ID requerido"); return; }

    json body;
    if (!parse_body(req, res, body)) return;

    std::string title = body.value("title", "");
    if (title.empty()) { json_error(res, 400, "Campo 'title' requerido"); return; }

    ConversationManager::instance().update_title(id, title);
    json_ok(res, {{"status", "updated"}});
}

void handle_delete_conversation(const httplib::Request& req, httplib::Response& res) {
    std::string id = path_param(req, "id");
    if (id.empty()) { json_error(res, 400, "ID requerido"); return; }

    ConversationManager::instance().delete_conversation(id);
    json_ok(res, {{"status", "deleted"}});
}

void handle_add_message(const httplib::Request& req, httplib::Response& res) {
    std::string id = path_param(req, "id");
    if (id.empty()) { json_error(res, 400, "ID de conversacion requerido"); return; }

    json body;
    if (!parse_body(req, res, body)) return;

    std::string role = body.value("role", "");
    std::string content = body.value("content", "");

    if (role.empty() || content.empty()) {
        json_error(res, 400, "Campos 'role' y 'content' requeridos");
        return;
    }

    ConversationManager::instance().add_message(id, role, content);
    res.status = 201;
    res.set_content(R"({"status":"created"})", "application/json");
}

void handle_clear_messages(const httplib::Request& req, httplib::Response& res) {
    std::string id = path_param(req, "id");
    if (id.empty()) { json_error(res, 400, "ID requerido"); return; }

    ConversationManager::instance().clear_messages(id);
    json_ok(res, {{"status", "cleared"}});
}

void handle_conversation_query(const httplib::Request& req, httplib::Response& res,
                                AlfredCore& core) {
    std::string conv_id = path_param(req, "id");
    if (conv_id.empty()) { json_error(res, 400, "ID de conversacion requerido"); return; }

    json body;
    if (!parse_body(req, res, body)) return;

    std::string question = body.value("question", "");
    if (question.empty()) { json_error(res, 400, "Campo 'question' requerido"); return; }

    bool use_history = body.value("use_history", true);
    bool search_documents = body.value("search_documents", true);

    // Guardar pregunta del usuario
    ConversationManager::instance().add_message(conv_id, "user", question);

    // Generar respuesta
    auto result = core.query(question, use_history, search_documents, conv_id);

    // Guardar respuesta del asistente
    ConversationManager::instance().add_message(conv_id, "assistant", result.answer);

    json data;
    data["answer"] = result.answer;
    data["sources"] = result.sources.empty() ? json(nullptr)
                      : json::parse(result.sources, nullptr, false);
    data["personal_data"] = result.personal_data.empty() ? json(nullptr)
                            : json::parse(result.personal_data, nullptr, false);
    data["from_cache"] = result.from_cache;
    data["from_history"] = result.from_history;
    data["time_ms"] = result.total_time_ms;
    data["conversation_id"] = conv_id;
    json_ok(res, data);
}

// ============================================================================
// Documentos
// ============================================================================
void handle_list_document_paths(const httplib::Request& /*req*/, httplib::Response& res) {
    auto paths = DBManager::instance().get_document_paths();
    json data = json::array();
    for (const auto& p : paths) {
        data.push_back({
            {"id", p.id},
            {"path", p.path},
            {"enabled", p.enabled},
            {"documents_count", p.documents_count},
            {"added_at", p.added_at}
        });
    }
    json_ok(res, data);
}

void handle_add_document_path(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string doc_path = body.value("path", "");
    if (doc_path.empty()) { json_error(res, 400, "Campo 'path' requerido"); return; }

    // Validar ruta
    auto validation = validate_document_path(doc_path);
    if (!validation.valid) {
        json_error(res, 400, "Ruta invalida: " + validation.message);
        return;
    }

    if (!std::filesystem::exists(doc_path)) {
        json_error(res, 400, "La ruta no existe: " + doc_path);
        return;
    }

    auto id = DBManager::instance().add_document_path(doc_path);
    res.status = 201;
    json data;
    data["id"] = id;
    data["path"] = doc_path;
    res.set_content(data.dump(), "application/json");
}

void handle_update_document_path(const httplib::Request& req, httplib::Response& res) {
    std::string id_str = path_param(req, "id");
    if (id_str.empty()) { json_error(res, 400, "ID requerido"); return; }

    json body;
    if (!parse_body(req, res, body)) return;

    bool enabled = body.value("enabled", true);
    int64_t id = std::stoll(id_str);
    DBManager::instance().update_document_path(id, enabled);
    json_ok(res, {{"status", "updated"}});
}

void handle_delete_document_path(const httplib::Request& req, httplib::Response& res) {
    std::string id_str = path_param(req, "id");
    if (id_str.empty()) { json_error(res, 400, "ID requerido"); return; }

    int64_t id = std::stoll(id_str);
    DBManager::instance().delete_document_path(id);
    json_ok(res, {{"status", "deleted"}});
}

void handle_reindex_documents(const httplib::Request& /*req*/, httplib::Response& res,
                               AlfredCore& core) {
    log_info("Solicitud de re-indexacion recibida");
    auto stats = core.reindex_all();
    json_ok(res, stats);
}

void handle_document_stats(const httplib::Request& /*req*/, httplib::Response& res) {
    auto stats = DBManager::instance().get_document_stats();
    json_ok(res, stats);
}

// ============================================================================
// Historial Q&A
// ============================================================================
void handle_search_history(const httplib::Request& req, httplib::Response& res) {
    std::string query_str = req.has_param("q") ? req.get_param_value("q") : "";
    if (query_str.empty()) {
        json_error(res, 400, "Parametro 'q' requerido");
        return;
    }

    float threshold = 0.3f;
    int top_k = 10;
    if (req.has_param("threshold")) threshold = std::stof(req.get_param_value("threshold"));
    if (req.has_param("top_k")) top_k = std::stoi(req.get_param_value("top_k"));

    auto results = HistoryManager::instance().search(query_str, threshold, top_k);

    json data = json::array();
    for (const auto& r : results) {
        data.push_back({
            {"question", r.entry.question},
            {"answer", r.entry.answer},
            {"score", r.score},
            {"timestamp", r.entry.timestamp},
            {"personal_data", r.entry.personal_data.empty() ? json(nullptr)
                              : json::parse(r.entry.personal_data, nullptr, false)},
            {"sources", r.entry.sources.empty() ? json(nullptr)
                        : json::parse(r.entry.sources, nullptr, false)}
        });
    }
    json_ok(res, data);
}

void handle_list_history(const httplib::Request& req, httplib::Response& res) {
    int limit = 100, offset = 0;
    if (req.has_param("limit")) limit = std::stoi(req.get_param_value("limit"));
    if (req.has_param("offset")) offset = std::stoi(req.get_param_value("offset"));

    auto entries = DBManager::instance().get_qa_history(limit, offset);

    json data = json::array();
    for (const auto& e : entries) {
        data.push_back({
            {"id", e.id},
            {"question", e.question},
            {"answer", e.answer},
            {"timestamp", e.timestamp},
            {"personal_data", e.personal_data.empty() ? json(nullptr)
                              : json::parse(e.personal_data, nullptr, false)},
            {"sources", e.sources.empty() ? json(nullptr)
                        : json::parse(e.sources, nullptr, false)}
        });
    }
    json_ok(res, data);
}

void handle_delete_history(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string timestamp = body.value("timestamp", "");
    if (timestamp.empty()) { json_error(res, 400, "Campo 'timestamp' requerido"); return; }

    DBManager::instance().delete_qa_history(timestamp);
    json_ok(res, {{"status", "deleted"}});
}

// ============================================================================
// Seguridad
// ============================================================================
void handle_welcome_status(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& db = DBManager::instance();
    auto completed = db.get_app_setting("welcome_completed");

    json data;
    data["completed"] = completed.has_value() && *completed == "true";
    json_ok(res, data);
}

void handle_welcome_complete(const httplib::Request& /*req*/, httplib::Response& res) {
    DBManager::instance().set_app_setting("welcome_completed", "true");
    json_ok(res, {{"status", "completed"}});
}

void handle_encryption_status(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& enc = Encryption::instance();
    json data;
    data["enabled"] = enc.is_enabled();
    data["has_key"] = enc.has_key();
    json_ok(res, data);
}

void handle_encryption_key(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string key = body.value("key", "");
    if (key.empty()) { json_error(res, 400, "Campo 'key' requerido"); return; }

    if (key.size() < 16) {
        json_error(res, 400, "La clave debe tener al menos 16 caracteres");
        return;
    }

    Encryption::instance().set_key(key);
    json_ok(res, {{"status", "key_set"}});
}

void handle_encryption_setup(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    bool enable = body.value("enabled", false);
    std::string key = body.value("key", "");

    if (enable && key.empty()) {
        json_error(res, 400, "Se requiere campo 'key' para habilitar encriptacion");
        return;
    }

    auto& enc = Encryption::instance();
    if (enable) {
        enc.set_key(key);
        enc.set_enabled(true);
    } else {
        enc.set_enabled(false);
    }

    json_ok(res, {{"status", enable ? "enabled" : "disabled"}});
}

// ============================================================================
// Settings de app
// ============================================================================
void handle_get_setting(const httplib::Request& req, httplib::Response& res) {
    std::string key = path_param(req, "key");
    if (key.empty()) { json_error(res, 400, "Clave requerida"); return; }

    auto value = DBManager::instance().get_app_setting(key);
    if (!value) { json_error(res, 404, "Setting no encontrado"); return; }

    json data;
    data["key"] = key;
    data["value"] = *value;
    json_ok(res, data);
}

void handle_set_setting(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string key = body.value("key", "");
    std::string value = body.value("value", "");
    if (key.empty()) { json_error(res, 400, "Campo 'key' requerido"); return; }

    DBManager::instance().set_app_setting(key, value);
    json_ok(res, {{"status", "saved"}});
}

// ============================================================================
// User settings
// ============================================================================
void handle_get_user_settings(const httplib::Request& /*req*/, httplib::Response& res) {
    auto settings = DBManager::instance().get_all_user_settings();
    json data = json::object();
    for (const auto& [key, value] : settings) {
        data[key] = value;
    }
    json_ok(res, data);
}

void handle_get_user_setting(const httplib::Request& req, httplib::Response& res) {
    std::string key = path_param(req, "key");
    if (key.empty()) { json_error(res, 400, "Clave requerida"); return; }

    auto value = DBManager::instance().get_user_setting(key);
    if (!value) { json_error(res, 404, "Setting no encontrado"); return; }

    json data;
    data["key"] = key;
    data["value"] = *value;
    json_ok(res, data);
}

void handle_set_user_setting(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string key = body.value("key", "");
    std::string value = body.value("value", "");
    if (key.empty()) { json_error(res, 400, "Campo 'key' requerido"); return; }

    DBManager::instance().set_user_setting(key, value);

    // Actualizar config en runtime si es perfil de usuario
    auto& cfg = get_config();
    if (key == "user_name") cfg.user_name = value;
    else if (key == "user_age") cfg.user_age = value;
    else if (key == "user_occupation") cfg.user_occupation = value;
    else if (key == "about_user") cfg.about_user = value;

    json_ok(res, {{"status", "saved"}});
}

void handle_delete_user_setting(const httplib::Request& req, httplib::Response& res) {
    std::string key = path_param(req, "key");
    if (key.empty()) { json_error(res, 400, "Clave requerida"); return; }

    DBManager::instance().delete_user_setting(key);
    json_ok(res, {{"status", "deleted"}});
}

// ============================================================================
// GPU
// ============================================================================
void handle_gpu_status(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& gpu = GPUManager::instance();
    json data = json::parse(gpu.status_json());
    json_ok(res, data);
}

void handle_gpu_report(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& gpu = GPUManager::instance();
    json data;
    data["report"] = gpu.status_report();
    data["has_cuda"] = gpu.has_cuda();
    json_ok(res, data);
}

// ============================================================================
// Modelos
// ============================================================================
void handle_list_models(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& cfg = get_config();
    std::string models_dir = cfg.models_dir;

    json data = json::array();

    if (std::filesystem::exists(models_dir)) {
        for (const auto& entry : std::filesystem::directory_iterator(models_dir)) {
            if (entry.is_regular_file() && entry.path().extension() == ".gguf") {
                auto size_bytes = entry.file_size();
                double size_gb = static_cast<double>(size_bytes) / (1024.0 * 1024.0 * 1024.0);

                data.push_back({
                    {"name", entry.path().filename().string()},
                    {"path", entry.path().string()},
                    {"size_bytes", size_bytes},
                    {"size_gb", std::round(size_gb * 100.0) / 100.0}
                });
            }
        }
    }

    json_ok(res, data);
}

void handle_change_model(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string model_path = body.value("model_path", "");
    if (model_path.empty()) {
        model_path = body.value("model_name", "");
        if (!model_path.empty()) {
            // Resolver nombre relativo
            model_path = get_config().models_dir + "/" + model_path;
        }
    }

    if (model_path.empty()) {
        json_error(res, 400, "Campo 'model_path' o 'model_name' requerido");
        return;
    }

    if (!std::filesystem::exists(model_path)) {
        json_error(res, 404, "Modelo no encontrado: " + model_path);
        return;
    }

    log_info("Cambiando modelo a: " + model_path);
    bool success = core.change_model(model_path);

    if (success) {
        json_ok(res, {{"status", "changed"}, {"model", model_path}});
    } else {
        json_error(res, 500, "Error cambiando modelo");
    }
}

void handle_model_status(const httplib::Request& /*req*/, httplib::Response& res,
                          AlfredCore& core) {
    json data;
    data["llm_loaded"] = core.llm().is_loaded();
    data["llm_model"] = core.llm().model_name();
    data["embedder_loaded"] = core.embedder().is_loaded();
    data["embedder_model"] = core.embedder().model_name();
    data["embedder_dim"] = core.embedder().dimension();
    json_ok(res, data);
}

// ============================================================================
// Optimizaciones
// ============================================================================
void handle_optimization_stats(const httplib::Request& /*req*/, httplib::Response& res,
                                AlfredCore& core) {
    json data;
    data["cache"] = core.get_cache_stats();
    data["vector_count"] = core.vector_store().count();
    data["qa_history"] = DBManager::instance().get_qa_history_stats();
    data["document_stats"] = DBManager::instance().get_document_stats();
    json_ok(res, data);
}

// ============================================================================
// Mantenimiento
// ============================================================================
void handle_reload_documents(const httplib::Request& /*req*/, httplib::Response& res,
                              AlfredCore& core) {
    log_info("Recargando documentos...");
    auto stats = core.reindex_all();
    json data;
    data["status"] = "reloaded";
    data["stats"] = stats;
    json_ok(res, data);
}

void handle_test_search(const httplib::Request& req, httplib::Response& res,
                         AlfredCore& core) {
    std::string query_str = req.has_param("q") ? req.get_param_value("q") : "";
    if (query_str.empty()) {
        json body;
        if (parse_body(req, res, body)) {
            query_str = body.value("query", "");
        }
    }

    if (query_str.empty()) {
        json_error(res, 400, "Parametro 'q' o campo 'query' requerido");
        return;
    }

    int k = 5;
    if (req.has_param("k")) k = std::stoi(req.get_param_value("k"));

    auto result = core.test_search(query_str, k);
    json_ok(res, result);
}

// ============================================================================
// Registro de todos los endpoints
// ============================================================================
void register_all_endpoints(httplib::Server& server, AlfredCore& core) {
    // Root y salud
    server.Get("/", [](const httplib::Request& req, httplib::Response& res) {
        handle_root(req, res);
    });
    server.Get("/health", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_health(req, res, core);
    });

    // Query
    server.Post("/query", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_query(req, res, core);
    });

    // Conversaciones
    server.Post("/conversations", [](const httplib::Request& req, httplib::Response& res) {
        handle_create_conversation(req, res);
    });
    server.Get("/conversations", [](const httplib::Request& req, httplib::Response& res) {
        handle_list_conversations(req, res);
    });
    server.Get("/conversations/:id", [](const httplib::Request& req, httplib::Response& res) {
        handle_get_conversation(req, res);
    });
    server.Put("/conversations/:id/title", [](const httplib::Request& req, httplib::Response& res) {
        handle_update_conversation_title(req, res);
    });
    server.Delete("/conversations/:id", [](const httplib::Request& req, httplib::Response& res) {
        handle_delete_conversation(req, res);
    });
    server.Post("/conversations/:id/messages", [](const httplib::Request& req, httplib::Response& res) {
        handle_add_message(req, res);
    });
    server.Delete("/conversations/:id/messages", [](const httplib::Request& req, httplib::Response& res) {
        handle_clear_messages(req, res);
    });
    server.Post("/conversations/:id/query", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_conversation_query(req, res, core);
    });

    // Documentos
    server.Get("/documents/paths", [](const httplib::Request& req, httplib::Response& res) {
        handle_list_document_paths(req, res);
    });
    server.Post("/documents/paths", [](const httplib::Request& req, httplib::Response& res) {
        handle_add_document_path(req, res);
    });
    server.Put("/documents/paths/:id", [](const httplib::Request& req, httplib::Response& res) {
        handle_update_document_path(req, res);
    });
    server.Delete("/documents/paths/:id", [](const httplib::Request& req, httplib::Response& res) {
        handle_delete_document_path(req, res);
    });
    server.Post("/documents/reindex", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_reindex_documents(req, res, core);
    });
    server.Get("/documents/stats", [](const httplib::Request& req, httplib::Response& res) {
        handle_document_stats(req, res);
    });

    // Historial
    server.Get("/history/search", [](const httplib::Request& req, httplib::Response& res) {
        handle_search_history(req, res);
    });
    server.Get("/history", [](const httplib::Request& req, httplib::Response& res) {
        handle_list_history(req, res);
    });
    server.Delete("/history", [](const httplib::Request& req, httplib::Response& res) {
        handle_delete_history(req, res);
    });

    // Seguridad
    server.Get("/welcome/status", [](const httplib::Request& req, httplib::Response& res) {
        handle_welcome_status(req, res);
    });
    server.Post("/welcome/complete", [](const httplib::Request& req, httplib::Response& res) {
        handle_welcome_complete(req, res);
    });
    server.Get("/encryption/status", [](const httplib::Request& req, httplib::Response& res) {
        handle_encryption_status(req, res);
    });
    server.Post("/encryption/key", [](const httplib::Request& req, httplib::Response& res) {
        handle_encryption_key(req, res);
    });
    server.Post("/encryption/setup", [](const httplib::Request& req, httplib::Response& res) {
        handle_encryption_setup(req, res);
    });

    // Settings
    server.Get("/settings/:key", [](const httplib::Request& req, httplib::Response& res) {
        handle_get_setting(req, res);
    });
    server.Post("/settings", [](const httplib::Request& req, httplib::Response& res) {
        handle_set_setting(req, res);
    });

    // User settings
    server.Get("/user/settings", [](const httplib::Request& req, httplib::Response& res) {
        handle_get_user_settings(req, res);
    });
    server.Get("/user/settings/:key", [](const httplib::Request& req, httplib::Response& res) {
        handle_get_user_setting(req, res);
    });
    server.Post("/user/settings", [](const httplib::Request& req, httplib::Response& res) {
        handle_set_user_setting(req, res);
    });
    server.Delete("/user/settings/:key", [](const httplib::Request& req, httplib::Response& res) {
        handle_delete_user_setting(req, res);
    });

    // GPU
    server.Get("/gpu/status", [](const httplib::Request& req, httplib::Response& res) {
        handle_gpu_status(req, res);
    });
    server.Get("/gpu/report", [](const httplib::Request& req, httplib::Response& res) {
        handle_gpu_report(req, res);
    });

    // Modelos
    server.Get("/models", [](const httplib::Request& req, httplib::Response& res) {
        handle_list_models(req, res);
    });
    server.Post("/models/change", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_change_model(req, res, core);
    });
    server.Get("/models/status", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_model_status(req, res, core);
    });

    // Optimizaciones
    server.Get("/optimization/stats", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_optimization_stats(req, res, core);
    });

    // Mantenimiento
    server.Post("/reload", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_reload_documents(req, res, core);
    });
    server.Get("/test/search", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_test_search(req, res, core);
    });
    server.Post("/test/search", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_test_search(req, res, core);
    });

    log_info("Endpoints registrados: ~40 rutas");
}

} // namespace alfred
