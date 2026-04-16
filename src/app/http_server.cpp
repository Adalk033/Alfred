// ============================================================================
// http_server.cpp - Servidor HTTP REST con cpp-httplib
// ============================================================================
// Equivalente a: OldProject/backend/core/alfred_backend.py (parte server)
// ============================================================================
#include "alfred/http_server.h"
#include "alfred/endpoints.h"
#include "alfred/alfred_core.h"
#include "alfred/logger.h"

#include <nlohmann/json.hpp>
#include <thread>
#include <chrono>

namespace alfred {

using json = nlohmann::json;

HttpServer::HttpServer()
    : server_(std::make_unique<httplib::Server>()) {}

HttpServer::~HttpServer() {
    stop();
}

bool HttpServer::setup(AlfredCore& core) {
    if (!server_) return false;

    // CORS
    setup_cors();

    // Logging middleware
    setup_logging();

    // Error handler global (solo si el endpoint no puso body propio)
    server_->set_error_handler([](const httplib::Request& /*req*/, httplib::Response& res) {
        if (!res.body.empty()) return;

        json err;
        if (res.status == 404) {
            err["error"] = "Ruta no encontrada";
        } else if (res.status == 405) {
            err["error"] = "Metodo no permitido";
        } else {
            err["error"] = "Error interno del servidor";
        }
        err["status"] = res.status;
        res.set_content(err.dump(), "application/json");
    });

    // Exception handler
    server_->set_exception_handler(
        [](const httplib::Request& /*req*/, httplib::Response& res, std::exception_ptr ep) {
            json err;
            try {
                std::rethrow_exception(ep);
            } catch (const std::exception& e) {
                err["error"] = std::string("Excepcion: ") + e.what();
                log_error("Excepcion no manejada: " + std::string(e.what()));
            } catch (...) {
                err["error"] = "Excepcion desconocida";
                log_error("Excepcion desconocida en handler");
            }
            res.status = 500;
            res.set_content(err.dump(), "application/json");
        });

    // Payload maximo: 50MB (para carga de documentos grandes)
    server_->set_payload_max_length(50 * 1024 * 1024);

    // Keep-alive
    server_->set_keep_alive_max_count(100);
    server_->set_keep_alive_timeout(30);

    // Read timeout
    server_->set_read_timeout(300);  // 5 minutos para queries LLM lentos
    server_->set_write_timeout(300);

    // Registrar todos los endpoints
    register_all_endpoints(*server_, core);

    return true;
}

void HttpServer::setup_cors() {
    server_->set_pre_routing_handler(
        [](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
            // Headers CORS para todas las respuestas
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods",
                          "GET, POST, PUT, DELETE, OPTIONS, PATCH");
            res.set_header("Access-Control-Allow-Headers",
                          "Content-Type, Authorization, X-Requested-With, Accept");
            res.set_header("Access-Control-Max-Age", "86400");

            // Preflight OPTIONS
            if (req.method == "OPTIONS") {
                res.status = 204;
                return httplib::Server::HandlerResponse::Handled;
            }

            return httplib::Server::HandlerResponse::Unhandled;
        });
}

void HttpServer::setup_logging() {
    server_->set_logger(
        [](const httplib::Request& req, const httplib::Response& res) {
            // Solo logear requests significativos (no OPTIONS ni health checks frecuentes)
            if (req.method == "OPTIONS") return;

            std::string log_line = req.method + " " + req.path +
                                   " -> " + std::to_string(res.status);

            if (res.status >= 400) {
                log_warn(log_line);
            } else {
                log_debug(log_line);
            }
        });
}

void HttpServer::start(const std::string& host, int port) {
    if (!server_) {
        log_error("Servidor no inicializado");
        return;
    }

    log_info("=== Iniciando Alfred HTTP Server ===");
    log_info("Escuchando en http://" + host + ":" + std::to_string(port));
    log_info("CORS habilitado para todos los origenes");
    log_info("Presiona Ctrl+C para detener");

    running_ = true;

    if (!server_->listen(host, port)) {
        log_error("Error: No se pudo iniciar el servidor en " +
                  host + ":" + std::to_string(port));
        log_error("Verifica que el puerto no este en uso");
        running_ = false;
    }
}

void HttpServer::stop() {
    if (server_ && running_) {
        log_info("Deteniendo servidor HTTP...");
        server_->stop();
        running_ = false;
        log_info("Servidor detenido");
    }
}

bool HttpServer::is_running() const {
    return running_;
}

} // namespace alfred
