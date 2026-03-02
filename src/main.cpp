// ============================================================================
// main.cpp - Punto de entrada de Alfred (Asistente IA local)
// ============================================================================
// Servidor REST HTTP con RAG local usando llama.cpp + CUDA
// Sin dependencia de Ollama - inferencia directa con modelos GGUF
//
// Para compilar y ejecutar:
//   cmake -S . -B build -DALFRED_CUDA=ON
//   cmake --build build --config Release
//   ./build/Release/alfred.exe
//
// Modelos requeridos en %APPDATA%/Alfred/models/ (o ~/.alfred/models/):
//   - gemma-2-9b-it-Q5_K_M.gguf  (LLM)
//   - nomic-embed-text-v1.5.Q5_K_M.gguf (embeddings)
// ============================================================================

#include "alfred/config.h"
#include "alfred/paths.h"
#include "alfred/logger.h"
#include "alfred/gpu_manager.h"
#include "alfred/db_manager.h"
#include "alfred/encryption.h"
#include "alfred/alfred_core.h"
#include "alfred/http_server.h"

#include <iostream>
#include <string>
#include <csignal>
#include <memory>
#include <thread>

// Servidor global para manejo de senales
static std::unique_ptr<alfred::HttpServer> g_server;

void signal_handler(int signum) {
    std::cout << "\n[Alfred] Senal recibida (" << signum << "), deteniendo...\n";
    if (g_server) {
        g_server->stop();
    }
}

void print_banner() {
    std::cout << "\n";
    std::cout << "  ================================================================\n";
    std::cout << "  Alfred - Asistente IA Local con RAG\n";
    std::cout << "  ================================================================\n";
    std::cout << "  Motor:     llama.cpp + GGUF (HuggingFace)\n";
    std::cout << "  Backend:   C++ nativo con cpp-httplib\n";
    std::cout << "  Vectores:  hnswlib (reemplaza ChromaDB)\n";
    std::cout << "  Database:  SQLite (encriptacion AES-256-GCM)\n";
    std::cout << "  ================================================================\n";
    std::cout << "\n";
}

int main(int argc, char* argv[]) {
    // Parsear argumentos CLI
    std::string host = "127.0.0.1";
    int port = 8000;
    bool verbose = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "--host" || arg == "-h") && i + 1 < argc) {
            host = argv[++i];
        } else if ((arg == "--port" || arg == "-p") && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        } else if (arg == "--help") {
            std::cout << "Uso: alfred [opciones]\n";
            std::cout << "  --host, -h <addr>  Direccion de escucha (default: 127.0.0.1)\n";
            std::cout << "  --port, -p <port>  Puerto (default: 8000)\n";
            std::cout << "  --verbose, -v      Modo verboso\n";
            std::cout << "  --help             Mostrar ayuda\n";
            return 0;
        }
    }

    print_banner();

    // 1. Inicializar rutas
    std::cout << "[1/6] Inicializando rutas...\n";
    alfred::init_paths();
    auto& cfg = alfred::get_config();

    // 2. Inicializar logger
    std::cout << "[2/6] Inicializando logger...\n";
    alfred::init_logger(cfg.logs_dir, verbose ? "debug" : "info");
    alfred::log_info("Alfred iniciando...");

    // 3. Registrar handler de senales
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // 4. Inicializar base de datos
    std::cout << "[3/6] Inicializando base de datos...\n";
    alfred::DBManager::instance().initialize(cfg.db_path);
    alfred::log_info("Base de datos inicializada");

    // 5. Configurar encriptacion (si hay clave guardada)
    std::cout << "[4/6] Configurando encriptacion...\n";
    auto enc_key = alfred::DBManager::instance().get_app_setting("encryption_key_hash");
    if (enc_key) {
        alfred::log_info("Encriptacion disponible (clave configurada previamente)");
    } else {
        alfred::log_info("Encriptacion: sin clave configurada");
    }

    // 6. Inicializar Alfred Core (carga modelos)
    std::cout << "[5/6] Inicializando Alfred Core (cargando modelos)...\n";
    alfred::AlfredCore core;
    if (!core.initialize()) {
        alfred::log_error("Error inicializando Alfred Core");
        std::cerr << "[ERROR] No se pudo inicializar Alfred Core.\n";
        std::cerr << "Verifica que los modelos GGUF esten en: " << cfg.models_dir << "\n";
        // Continuar de todas formas - API estara disponible pero sin LLM
    }

    // 7. Configurar y arrancar servidor HTTP
    std::cout << "[6/6] Iniciando servidor HTTP...\n";
    g_server = std::make_unique<alfred::HttpServer>();

    if (!g_server->setup(core)) {
        alfred::log_error("Error configurando servidor HTTP");
        return 1;
    }

    alfred::log_info("Servidor listo en http://" + host + ":" + std::to_string(port));
    std::cout << "\n  [OK] Alfred listo en http://" << host << ":" << port << "\n";
    std::cout << "  [OK] API docs: GET /health, POST /query, GET /models\n";
    std::cout << "  [OK] Presiona Ctrl+C para detener\n\n";

    // Bloqueante - corre hasta Ctrl+C
    g_server->start(host, port);

    // Limpieza
    alfred::log_info("Alfred detenido correctamente");
    std::cout << "[Alfred] Hasta la vista.\n";

    return 0;
}
