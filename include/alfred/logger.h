// ============================================================================
// logger.h - Sistema de logging estructurado
// ============================================================================
// Equivalente a: OldProject/backend/utils/logger.py
// Wrapper sobre spdlog con rotacion de archivos y formato consistente.
// ============================================================================
#pragma once

#include <string>
#include <memory>
#include <spdlog/spdlog.h>

namespace alfred {

// Inicializar el sistema de logging
// Crea loggers para consola y archivo con rotacion
void init_logger(const std::string& log_dir, const std::string& log_level = "info");

// Obtener el logger principal
std::shared_ptr<spdlog::logger> get_logger();

// Shortcuts de logging
void log_info(const std::string& msg);
void log_warn(const std::string& msg);
void log_error(const std::string& msg);
void log_debug(const std::string& msg);

} // namespace alfred
