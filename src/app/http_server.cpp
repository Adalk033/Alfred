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

    // Pre-routing: autenticacion por token + preflight CORS
    setup_pre_routing();

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

void HttpServer::setup_pre_routing() {
    // Captura por valor del token para el closure.
    std::string token = auth_token_;
    server_->set_pre_routing_handler(
        [token](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
            // Sin CORS con wildcard: la UI usa HttpClient (no navegador) y no
            // lo necesita. Evitar "Allow-Origin: *" cierra el hueco por el que
            // cualquier pagina web podia invocar la API local (CSRF).
            res.set_header("Access-Control-Allow-Methods",
                          "GET, POST, PUT, DELETE, OPTIONS, PATCH");
            res.set_header("Access-Control-Allow-Headers",
                          "Content-Type, X-Alfred-Token, Accept");

            // Preflight OPTIONS: responder sin exigir token.
            if (req.method == "OPTIONS") {
                res.status = 204;
                return httplib::Server::HandlerResponse::Handled;
            }

            // Autenticacion por token compartido UI<->backend. /health queda
            // exento para sondeos de disponibilidad.
            if (!token.empty() && req.path != "/health") {
                if (req.get_header_value("X-Alfred-Token") != token) {
                    res.status = 401;
                    res.set_content(R"({"error":"No autorizado"})", "application/json");
                    return httplib::Server::HandlerResponse::Handled;
                }
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

bool HttpServer::bind(const std::string& host, int port) {
    if (!server_) {
        log_error("Servidor no inicializado");
        return false;
    }

    // bind_to_port reserva el socket de inmediato: si el puerto esta ocupado
    // falla aqui, antes de que main reporte "listo".
    int bound = server_->bind_to_port(host, port);
    if (bound <= 0) {
        log_error("Error: No se pudo reservar el puerto " +
                  host + ":" + std::to_string(port) + " (¿en uso?)");
        return false;
    }

    log_info("=== Alfred HTTP Server enlazado en http://" + host + ":" +
             std::to_string(port) + " ===");
    running_ = true;
    return true;
}

void HttpServer::start() {
    if (!server_ || !running_) {
        log_error("start() requiere un bind() previo exitoso");
        return;
    }
    log_info("Escuchando (Ctrl+C para detener)");
    if (!server_->listen_after_bind()) {
        log_error("Error durante la escucha del servidor");
    }
    running_ = false;
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
