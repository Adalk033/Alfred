// ============================================================================
// logger.cpp - Sistema de logging estructurado con spdlog
// ============================================================================
#include "alfred/logger.h"
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/rotating_file_sink.h>

namespace alfred {

static std::shared_ptr<spdlog::logger> g_logger;

void init_logger(const std::string& log_dir, const std::string& log_level) {
    try {
        // Sink de consola con colores
        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        console_sink->set_pattern("[%Y-%m-%d %H:%M:%S] [%^%l%$] %v");

        // Sink de archivo con rotacion (10MB max, 3 archivos)
        auto file_path = log_dir + "/alfred.log";
        auto file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
            file_path, 10 * 1024 * 1024, 3);
        file_sink->set_pattern("[%Y-%m-%d %H:%M:%S] [%l] [%s:%#] %v");

        // Crear logger multi-sink
        g_logger = std::make_shared<spdlog::logger>("alfred",
            spdlog::sinks_init_list{console_sink, file_sink});

        // Nivel de log
        if (log_level == "debug") g_logger->set_level(spdlog::level::debug);
        else if (log_level == "warn") g_logger->set_level(spdlog::level::warn);
        else if (log_level == "error") g_logger->set_level(spdlog::level::err);
        else g_logger->set_level(spdlog::level::info);

        g_logger->flush_on(spdlog::level::warn);
        spdlog::set_default_logger(g_logger);

        g_logger->info("Logger inicializado [nivel: {}] [archivo: {}]", log_level, file_path);
    } catch (const spdlog::spdlog_ex& ex) {
        // Fallback: solo consola
        g_logger = spdlog::stdout_color_mt("alfred");
        g_logger->error("Error inicializando file logger: {}", ex.what());
    }
}

std::shared_ptr<spdlog::logger> get_logger() {
    if (!g_logger) {
        g_logger = spdlog::stdout_color_mt("alfred_default");
    }
    return g_logger;
}

void log_info(const std::string& msg)  { get_logger()->info(msg); }
void log_warn(const std::string& msg)  { get_logger()->warn(msg); }
void log_error(const std::string& msg) { get_logger()->error(msg); }
void log_debug(const std::string& msg) { get_logger()->debug(msg); }

} // namespace alfred
