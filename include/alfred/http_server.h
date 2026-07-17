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

    // Token requerido en la cabecera X-Alfred-Token. Vacio = sin auth
    // (util para arranque manual del backend). Debe fijarse antes de setup().
    void set_auth_token(const std::string& token) { auth_token_ = token; }

    // Reservar el puerto (no bloqueante). Devuelve false si el bind falla
    // (p.ej. puerto en uso), permitiendo reportar el error antes de aceptar.
    bool bind(const std::string& host = "127.0.0.1", int port = 8000);

    // Iniciar servidor (bloqueante). Requiere un bind() previo exitoso.
    void start();

    // Detener servidor
    void stop();

    // Verificar si esta corriendo
    bool is_running() const;

private:
    std::unique_ptr<httplib::Server> server_;
    // Atomico: lo escriben start()/stop() y lo lee el handler de senales.
    std::atomic<bool> running_{false};
    std::string auth_token_;

    // Pre-routing: valida el token y responde preflight CORS
    void setup_pre_routing();

    // Middleware de logging
    void setup_logging();
};

} // namespace alfred
