// ============================================================================
// endpoints.h - Handlers de endpoints HTTP
// ============================================================================
// Equivalente a: OldProject/backend/core/endpoints/*
// Todos los handlers de la API REST agrupados por modulo.
// ============================================================================
#pragma once

#include <httplib.h>
#include <memory>

namespace alfred {

class AlfredCore;

// Registrar todos los endpoints en el servidor
void register_all_endpoints(httplib::Server& server, AlfredCore& core);

// --- Handlers por modulo ---

// Root y salud
void handle_root(const httplib::Request& req, httplib::Response& res);
void handle_health(const httplib::Request& req, httplib::Response& res,
                   AlfredCore& core);

// Query
void handle_query(const httplib::Request& req, httplib::Response& res,
                  AlfredCore& core);

// Conversaciones
void handle_create_conversation(const httplib::Request& req, httplib::Response& res);
void handle_list_conversations(const httplib::Request& req, httplib::Response& res);
void handle_get_conversation(const httplib::Request& req, httplib::Response& res);
void handle_update_conversation_title(const httplib::Request& req, httplib::Response& res);
void handle_delete_conversation(const httplib::Request& req, httplib::Response& res);
void handle_add_message(const httplib::Request& req, httplib::Response& res);
void handle_clear_messages(const httplib::Request& req, httplib::Response& res);
void handle_conversation_query(const httplib::Request& req, httplib::Response& res,
                                AlfredCore& core);

// Documentos
void handle_list_document_paths(const httplib::Request& req, httplib::Response& res);
void handle_add_document_path(const httplib::Request& req, httplib::Response& res);
void handle_update_document_path(const httplib::Request& req, httplib::Response& res);
void handle_delete_document_path(const httplib::Request& req, httplib::Response& res);
void handle_reindex_documents(const httplib::Request& req, httplib::Response& res,
                               AlfredCore& core);
void handle_document_stats(const httplib::Request& req, httplib::Response& res);

// Historial Q&A
void handle_search_history(const httplib::Request& req, httplib::Response& res);
void handle_list_history(const httplib::Request& req, httplib::Response& res);
void handle_delete_history(const httplib::Request& req, httplib::Response& res);

// Seguridad
void handle_welcome_status(const httplib::Request& req, httplib::Response& res);
void handle_welcome_complete(const httplib::Request& req, httplib::Response& res);
void handle_encryption_status(const httplib::Request& req, httplib::Response& res);
void handle_encryption_key(const httplib::Request& req, httplib::Response& res);
void handle_encryption_setup(const httplib::Request& req, httplib::Response& res);

// Settings
void handle_get_setting(const httplib::Request& req, httplib::Response& res);
void handle_set_setting(const httplib::Request& req, httplib::Response& res);

// User
void handle_get_user_settings(const httplib::Request& req, httplib::Response& res);
void handle_get_user_setting(const httplib::Request& req, httplib::Response& res);
void handle_set_user_setting(const httplib::Request& req, httplib::Response& res);
void handle_delete_user_setting(const httplib::Request& req, httplib::Response& res);

// GPU
void handle_gpu_status(const httplib::Request& req, httplib::Response& res);
void handle_gpu_report(const httplib::Request& req, httplib::Response& res);

// Modelos (reemplaza endpoints de Ollama)
void handle_list_models(const httplib::Request& req, httplib::Response& res);
void handle_change_model(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);
void handle_model_status(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);

// Optimizaciones
void handle_optimization_stats(const httplib::Request& req, httplib::Response& res,
                                AlfredCore& core);

// Mantenimiento
void handle_reload_documents(const httplib::Request& req, httplib::Response& res,
                              AlfredCore& core);
void handle_test_search(const httplib::Request& req, httplib::Response& res,
                         AlfredCore& core);

} // namespace alfred
