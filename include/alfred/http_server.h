// ============================================================================
// http_server.h - Servidor HTTP REST
// ============================================================================
// Equivalente a: OldProject/backend/core/alfred_backend.py (parte server)
// Servidor HTTP con cpp-httplib. CORS habilitado, JSON responses.
// Misma API que el backend FastAPI original para compatibilidad con frontend.
// ============================================================================
#pragma once

#include <string>
#include <memory>
#include <atomic>
#include <httplib.h>

namespace alfred {

class AlfredCore;

class HttpServer {
public:
    HttpServer();
    ~HttpServer();

    // Configurar y registrar todos los endpoints
    bool setup(AlfredCore& core);

    // Iniciar servidor (bloqueante)
    void start(const std::string& host = "127.0.0.1", int port = 8000);

    // Detener servidor
    void stop();

    // Verificar si esta corriendo
    bool is_running() const;

private:
    std::unique_ptr<httplib::Server> server_;
    // Atomico: lo escriben start()/stop() y lo lee el handler de senales.
    std::atomic<bool> running_{false};

    // Configurar CORS
    void setup_cors();

    // Middleware de logging
    void setup_logging();
};

} // namespace alfred
