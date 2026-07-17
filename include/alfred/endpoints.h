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

// Query con streaming SSE (Server-Sent Events)
void handle_query_stream(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);
void handle_conversation_query_stream(const httplib::Request& req, httplib::Response& res,
                                        AlfredCore& core);

// Cancelacion de un query streaming en curso
void handle_query_cancel(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);

// Conversaciones
void handle_create_conversation(const httplib::Request& req, httplib::Response& res);
void handle_list_conversations(const httplib::Request& req, httplib::Response& res);
void handle_get_conversation(const httplib::Request& req, httplib::Response& res);
void handle_update_conversation_title(const httplib::Request& req, httplib::Response& res);
void handle_delete_conversation(const httplib::Request& req, httplib::Response& res);
void handle_delete_conversations_bulk(const httplib::Request& req, httplib::Response& res);
void handle_add_message(const httplib::Request& req, httplib::Response& res);
void handle_clear_messages(const httplib::Request& req, httplib::Response& res);
void handle_conversation_query(const httplib::Request& req, httplib::Response& res,
                                AlfredCore& core);

// Seguridad
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
void handle_delete_model(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);
void handle_unload_model(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core);
void handle_get_model_config(const httplib::Request& req, httplib::Response& res);
void handle_set_model_config(const httplib::Request& req, httplib::Response& res,
                              AlfredCore& core);
void handle_autotune(const httplib::Request& req, httplib::Response& res,
                      AlfredCore& core);

// Tokens
void handle_token_count(const httplib::Request& req, httplib::Response& res,
                        AlfredCore& core);
void handle_token_budget(const httplib::Request& req, httplib::Response& res,
                         AlfredCore& core);

// Archivos (PDFs, etc.)
void handle_extract_pdf(const httplib::Request& req, httplib::Response& res,
                         AlfredCore& core);

} // namespace alfred
