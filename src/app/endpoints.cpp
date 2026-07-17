// ============================================================================
// endpoints.cpp - Handlers de endpoints HTTP REST
// ============================================================================
// Equivalente a: OldProject/backend/core/endpoints/*
// ============================================================================
#include "alfred/endpoints.h"
#include "alfred/alfred_core.h"
#include "alfred/conversation_manager.h"
#include "alfred/db_manager.h"
#include "alfred/gpu_manager.h"
#include "alfred/encryption.h"
#include "alfred/config.h"
#include "alfred/paths.h"
#include "alfred/logger.h"
#include "alfred/string_utils.h"
#include "alfred/token_accountant.h"
#include "alfred/pdf_extractor.h"

#include <nlohmann/json.hpp>
#include <filesystem>
#include <chrono>
#include <algorithm>

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

// Helper: parsear parametro entero de query string con clamping de rango
// Retorna false (y escribe error 400) si el valor no es un entero valido
static bool get_int_param(const httplib::Request& req, httplib::Response& res,
                           const std::string& name, int& out, int min_val, int max_val) {
    if (!req.has_param(name)) return true;
    try {
        out = std::stoi(req.get_param_value(name));
    } catch (const std::exception&) {
        json_error(res, 400, "Parametro '" + name + "' invalido (debe ser un entero)");
        return false;
    }
    out = std::max(min_val, std::min(max_val, out));
    return true;
}

// Helper: parsear parametro float de query string con clamping de rango
static bool get_float_param(const httplib::Request& req, httplib::Response& res,
                             const std::string& name, float& out, float min_val, float max_val) {
    if (!req.has_param(name)) return true;
    try {
        out = std::stof(req.get_param_value(name));
    } catch (const std::exception&) {
        json_error(res, 400, "Parametro '" + name + "' invalido (debe ser un numero)");
        return false;
    }
    out = std::max(min_val, std::min(max_val, out));
    return true;
}

// ============================================================================
// Root y salud
// ============================================================================
void handle_root(const httplib::Request& /*req*/, httplib::Response& res) {
    json data;
    data["name"] = "Alfred";
    data["version"] = ALFRED_VERSION;
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

// Helper: extraer contenido de texto de archivos adjuntos para inyectar como contexto
static std::string extract_attached_context(const json& body) {
    if (!body.contains("attached_files") || !body["attached_files"].is_array())
        return "";

    std::string context;
    std::string image_audio_context;
    std::string other_binary_context;
    std::string text_context;

    auto classify_attachment = [](const std::string& content) -> int {
        // Prioridad multimodal: imagen/audio antes que texto.
        // 0 = image/audio, 1 = binario no image/audio, 2 = texto.
        if (!(content.rfind("data:", 0) == 0 && content.find(";base64,") != std::string::npos)) {
            return 2;
        }

        size_t mime_start = 5; // despues de "data:"
        size_t mime_end = content.find(';', mime_start);
        if (mime_end == std::string::npos || mime_end <= mime_start) {
            return 1;
        }

        std::string mime = to_lower(content.substr(mime_start, mime_end - mime_start));
        if (mime.rfind("image/", 0) == 0 || mime.rfind("audio/", 0) == 0) {
            return 0;
        }
        return 1;
    };

    for (const auto& file : body["attached_files"]) {
        std::string name = file.value("name", "");
        std::string content = file.value("content", "");
        if (name.empty() || content.empty()) continue;

        int kind = classify_attachment(content);

        // Si el contenido es base64 (data:...;base64,...) solo incluir el nombre como referencia
        // El backend no puede decodificar binarios como PDF sin librerias externas
        if (content.rfind("data:", 0) == 0 && content.find(";base64,") != std::string::npos) {
            std::string line = "\n[Archivo adjunto: " + name + " (formato binario, contenido no procesable directamente)]\n";
            if (kind == 0) {
                image_audio_context += line;
            } else {
                other_binary_context += line;
            }
        } else {
            // Archivo de texto plano: incluir contenido completo
            // Limitar a 50000 caracteres por archivo para evitar desbordar el contexto
            std::string trimmed = content.length() > 50000 ? content.substr(0, 50000) + "\n... (contenido truncado)" : content;
            text_context += "\n--- Contenido de " + name + " ---\n" + trimmed + "\n--- Fin de " + name + " ---\n";
        }
    }

    context.reserve(image_audio_context.size() + other_binary_context.size() + text_context.size());
    context += image_audio_context;
    context += other_binary_context;
    context += text_context;

    return context;
}

void handle_query(const httplib::Request& req, httplib::Response& res,
                  AlfredCore& core) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string question = body.value("question", "");
    if (question.empty()) {
        json_error(res, 400, "Campo 'question' requerido");
        return;
    }

    // Inyectar contenido de archivos adjuntos como contexto adicional
    std::string attached_context = extract_attached_context(body);
    std::string full_question = question;
    if (!attached_context.empty()) {
        full_question = "Contexto de archivos adjuntos:\n" + attached_context + "\n\nPregunta del usuario: " + question;
        log_info("Query con " + std::to_string(body["attached_files"].size()) + " archivos adjuntos");
    }

    log_info("Query: " + truncate(question, 80));

    auto result = core.query(full_question);

    json data;
    data["answer"] = result.answer;
    data["from_cache"] = result.from_cache;
    data["time_ms"] = result.total_time_ms;
    json_ok(res, data);
}

// ============================================================================
// Query con streaming (SSE)
// ============================================================================

// Helper: serializa un evento SSE.
static std::string sse_event(const std::string& type, const json& payload) {
    std::string out;
    out.reserve(64 + payload.dump().size());
    out += "event: ";
    out += type;
    out += "\n";
    out += "data: ";
    out += payload.dump();
    out += "\n\n";
    return out;
}

// Implementacion compartida entre /query/stream y /conversations/:id/query/stream.
// `conv_id` vacio para /query/stream.
static void run_query_stream(const httplib::Request& req,
                              httplib::Response& res,
                              AlfredCore& core,
                              const std::string& conv_id) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string question = body.value("question", "");
    if (question.empty()) {
        json_error(res, 400, "Campo 'question' requerido");
        return;
    }

    // Inyectar archivos adjuntos como contexto
    std::string attached_context = extract_attached_context(body);
    std::string full_question = question;
    if (!attached_context.empty()) {
        full_question = "Contexto de archivos adjuntos:\n" + attached_context +
                        "\n\nPregunta del usuario: " + question;
    }

    // En conversacion guardamos la pregunta del usuario antes de generar
    if (!conv_id.empty()) {
        ConversationManager::instance().add_message(conv_id, "user", question);
    }

    log_info("Streaming query: " + truncate(question, 80) +
             (conv_id.empty() ? "" : " (conv: " + conv_id + ")"));

    res.set_header("Cache-Control", "no-cache");
    res.set_header("Connection", "keep-alive");
    res.set_header("X-Accel-Buffering", "no");

    std::string captured_question = question;
    std::string captured_full     = full_question;
    std::string captured_conv_id  = conv_id;

    res.set_chunked_content_provider(
        "text/event-stream",
        [&core, captured_question, captured_full, captured_conv_id]
        (size_t /*offset*/, httplib::DataSink& sink) -> bool {
            auto write_event = [&sink](const std::string& evt, const json& data) -> bool {
                std::string out = sse_event(evt, data);
                return sink.write(out.data(), out.size());
            };

            auto on_started = [&](uint64_t request_id) {
                json data = {{"request_id", request_id}};
                write_event("start", data);
            };

            auto on_token = [&](const std::string& tok) -> bool {
                if (sink.is_writable && !sink.is_writable()) return false;
                json data = {{"text", tok}};
                return write_event("token", data);
            };

            QueryResult result = core.query_streaming(
                captured_full, on_started, on_token, captured_conv_id);

            // Guardar la respuesta completa del asistente en la conversacion
            if (!captured_conv_id.empty() && !result.cancelled &&
                !result.answer.empty() &&
                result.answer.find("Error") == std::string::npos) {
                ConversationManager::instance().add_message(
                    captured_conv_id, "assistant", extract_final_response_text(result.answer));
            }

            json done_payload;
            done_payload["answer"]     = result.answer;
            done_payload["from_cache"] = result.from_cache;
            done_payload["cancelled"]  = result.cancelled;
            done_payload["time_ms"]    = result.total_time_ms;
            if (!captured_conv_id.empty())
                done_payload["conversation_id"] = captured_conv_id;

            write_event("done", done_payload);
            sink.done();
            return true;
        });
}

void handle_query_stream(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core) {
    run_query_stream(req, res, core, "");
}

void handle_conversation_query_stream(const httplib::Request& req, httplib::Response& res,
                                       AlfredCore& core) {
    std::string conv_id = path_param(req, "id");
    if (conv_id.empty()) {
        json_error(res, 400, "ID de conversacion requerido");
        return;
    }
    run_query_stream(req, res, core, conv_id);
}

void handle_query_cancel(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core) {
    uint64_t request_id = 0;
    if (!req.body.empty()) {
        json body;
        if (parse_body(req, res, body)) {
            if (body.contains("request_id") && body["request_id"].is_number_unsigned()) {
                request_id = body["request_id"].get<uint64_t>();
            }
        } else {
            return;  // parse_body ya escribio el error
        }
    }

    bool cancelled = core.cancel_query(request_id);
    json data;
    data["cancelled"] = cancelled;
    data["request_id"] = request_id;
    json_ok(res, data);
}

// ============================================================================
// Seguridad
// ============================================================================
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

    auto& enc = Encryption::instance();
    if (enable) {
        // La passphrase es opcional: sin ella se usa la clave de archivo
        // generada al arrancar. Con passphrase, se deriva y persiste.
        if (!key.empty()) enc.set_key(key);
        if (!enc.has_key()) {
            json_error(res, 500, "No hay clave de encriptacion disponible");
            return;
        }
        enc.set_enabled(true);
    } else {
        enc.set_enabled(false);
    }

    // Persistir el estado para restaurarlo en el proximo arranque.
    DBManager::instance().set_app_setting("encryption_enabled", enable ? "1" : "0");

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

    auto& cfg = get_config();
    if (key == "model_idle_timeout_sec") {
        try { cfg.model_idle_timeout_sec = std::stoi(value); } catch (const std::exception&) {}
    } else if (key == "model_lazy_load") {
        cfg.model_lazy_load = (value == "true" || value == "1");
    }

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

    // Actualizar config en runtime si es perfil de usuario o personalizacion
    auto& cfg = get_config();
    if (key == "user_name") cfg.user_name = value;
    else if (key == "user_age") cfg.user_age = value;
    else if (key == "user_occupation") cfg.user_occupation = value;
    else if (key == "about_user") cfg.about_user = value;
    else if (key == "assistant_name")
        cfg.assistant_name = value.empty() ? std::string{"Alfred"} : value;
    else if (key == "response_tone")
        cfg.response_tone = value.empty() ? std::string{"professional"} : value;
    else if (key == "custom_instructions")
        cfg.custom_instructions = value;

    json_ok(res, {{"status", "saved"}});
}

void handle_delete_user_setting(const httplib::Request& req, httplib::Response& res) {
    std::string key = path_param(req, "key");
    if (key.empty()) { json_error(res, 400, "Clave requerida"); return; }

    DBManager::instance().delete_user_setting(key);

    // Reset en runtime a valores por defecto para personalizacion
    auto& cfg = get_config();
    if (key == "assistant_name")           cfg.assistant_name = "Alfred";
    else if (key == "response_tone")       cfg.response_tone  = "professional";
    else if (key == "custom_instructions") cfg.custom_instructions.clear();

    json_ok(res, {{"status", "deleted"}});
}

// ============================================================================
// GPU
// ============================================================================
void handle_gpu_status(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& gpu = GPUManager::instance();
    try {
        json data = json::parse(gpu.status_json());
        json_ok(res, data);
    } catch (const json::parse_error&) {
        json_error(res, 500, "Error obteniendo estado de GPU");
    }
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

// Helper: valida que un nombre de modelo no pueda escapar del directorio de
// modelos. httplib decodifica percent-encoding despues del match de ruta,
// asi que "..%2f" llega aqui como "../": rechazamos separadores, "..",
// unidades (:) y nombres vacios.
static bool is_safe_model_name(const std::string& name) {
    if (name.empty()) return false;
    if (name.find('/') != std::string::npos) return false;
    if (name.find('\\') != std::string::npos) return false;
    if (name.find("..") != std::string::npos) return false;
    if (name.find(':') != std::string::npos) return false;
    return true;
}

// Helper: true si `candidate` queda dentro de `base` tras canonizar ambas.
static bool path_within_dir(const std::filesystem::path& candidate,
                            const std::filesystem::path& base) {
    std::error_code ec;
    auto canon_candidate = std::filesystem::weakly_canonical(candidate, ec);
    if (ec) return false;
    auto canon_base = std::filesystem::weakly_canonical(base, ec);
    if (ec) return false;
    auto rel = canon_candidate.lexically_relative(canon_base);
    if (rel.empty()) return false;
    auto first = rel.begin()->string();
    return first != ".." && first != ".";
}

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
        std::string model_name = body.value("model_name", "");
        if (!model_name.empty()) {
            if (!is_safe_model_name(model_name)) {
                json_error(res, 400, "Nombre de modelo invalido");
                return;
            }
            // Resolver nombre relativo
            model_path = get_config().models_dir + "/" + model_name;
        }
    }

    if (model_path.empty()) {
        json_error(res, 400, "Campo 'model_path' o 'model_name' requerido");
        return;
    }

    // Los modelos solo se cargan desde el directorio de modelos: evita que
    // un request manipulado apunte a rutas arbitrarias del sistema.
    if (!path_within_dir(model_path, get_config().models_dir)) {
        json_error(res, 400, "La ruta del modelo debe estar dentro del directorio de modelos");
        return;
    }

    if (!std::filesystem::exists(model_path)) {
        json_error(res, 404, "Modelo no encontrado: " + model_path);
        return;
    }

    log_info("Cambiando modelo a: " + model_path);
    auto result = core.change_model(model_path);

    if (result.success) {
        json data = {{"status", "changed"}, {"model", model_path}};
        if (!result.warning.empty())
            data["warning"] = result.warning;
        json_ok(res, data);
    } else {
        json_error(res, 500, result.error.empty() ? "Error cambiando modelo" : result.error);
    }
}

void handle_model_status(const httplib::Request& /*req*/, httplib::Response& res,
                          AlfredCore& core) {
    json data;
    data["llm_loaded"] = core.llm().is_loaded();
    data["llm_model"] = core.llm().model_name();
    data["models_dir"] = get_config().models_dir;
    json_ok(res, data);
}

void handle_delete_model(const httplib::Request& req, httplib::Response& res,
                          AlfredCore& core) {
    std::string name = path_param(req, "name");
    if (name.empty()) {
        json_error(res, 400, "Nombre del modelo requerido");
        return;
    }

    if (!is_safe_model_name(name)) {
        json_error(res, 400, "Nombre de modelo invalido");
        return;
    }

    // Construir ruta completa y verificar que no escape del directorio
    std::string model_path = get_config().models_dir + "/" + name;
    if (!path_within_dir(model_path, get_config().models_dir)) {
        json_error(res, 400, "Nombre de modelo invalido");
        return;
    }

    if (!std::filesystem::exists(model_path)) {
        json_error(res, 404, "Modelo no encontrado: " + name);
        return;
    }

    // No permitir eliminar el modelo actualmente cargado
    if (core.llm().is_loaded() && core.llm().model_name() == name) {
        json_error(res, 409, "No se puede eliminar el modelo que esta cargado actualmente. Cambia a otro modelo primero.");
        return;
    }

    // Eliminar el archivo
    std::error_code ec;
    std::filesystem::remove(model_path, ec);
    if (ec) {
        json_error(res, 500, "Error eliminando modelo: " + ec.message());
        return;
    }

    log_info("Modelo eliminado: " + name);
    json_ok(res, {{"status", "deleted"}, {"model", name}});
}

// ============================================================================
// Descargar modelo (liberar recursos)
// ============================================================================
void handle_unload_model(const httplib::Request& /*req*/, httplib::Response& res,
                          AlfredCore& core) {
    try {
        if (core.model_state() == ModelState::PROCESSING) {
            json_error(res, 409,
                "No se puede descargar el modelo mientras se genera una respuesta.");
            return;
        }

        bool was_loaded = core.llm().is_loaded();
        core.unload_current_model();
        bool still_loaded = core.llm().is_loaded();

        json data;
        if (!was_loaded) {
            data["status"] = "already_unloaded";
        } else if (still_loaded) {
            data["status"] = "busy";
            data["message"] = "El modelo sigue cargado; reintenta en unos segundos.";
        } else {
            data["status"] = "unloaded";
        }
        json_ok(res, data);
    } catch (const std::exception& e) {
        log_error(std::string("Error en /models/unload: ") + e.what());
        json_error(res, 500, "Error interno al descargar modelo");
    } catch (...) {
        log_error("Error desconocido en /models/unload");
        json_error(res, 500, "Error interno al descargar modelo");
    }
}

// ============================================================================
// Configuracion del modelo LLM
// ============================================================================
void handle_get_model_config(const httplib::Request& /*req*/, httplib::Response& res) {
    auto& cfg = get_config();
    json data;
    data["n_ctx"]        = cfg.n_ctx;
    data["n_gpu_layers"] = cfg.n_gpu_layers;
    data["n_batch"]      = cfg.n_batch;
    data["n_threads"]    = cfg.n_threads;
    data["temperature"]  = cfg.temperature;
    data["top_p"]        = cfg.top_p;
    data["max_tokens"]   = cfg.max_tokens;
    data["seed"]         = cfg.seed;

    // Tuning avanzado
    data["n_ubatch"]        = cfg.n_ubatch;
    data["n_threads_batch"] = cfg.n_threads_batch;
    data["flash_attn"]      = cfg.flash_attn;
    data["offload_kqv"]     = cfg.offload_kqv;
    data["use_mmap"]        = cfg.use_mmap;
    data["use_mlock"]       = cfg.use_mlock;
    data["cache_type_k"]    = cfg.cache_type_k;
    data["cache_type_v"]    = cfg.cache_type_v;
    data["top_k"]           = cfg.top_k;
    data["min_p"]           = cfg.min_p;
    data["repeat_penalty"]  = cfg.repeat_penalty;
    data["repeat_last_n"]   = cfg.repeat_last_n;
    data["thinking_enabled"] = cfg.thinking_enabled;

    json_ok(res, data);
}

void handle_set_model_config(const httplib::Request& req, httplib::Response& res,
                              AlfredCore& core) {
    json body;
    if (!parse_body(req, res, body)) return;

    auto& cfg = get_config();
    auto& db  = DBManager::instance();

    // Parametros que requieren reinicio del modelo
    bool needs_reload = false;

    if (body.contains("n_ctx") && body["n_ctx"].is_number_integer()) {
        int v = body["n_ctx"].get<int>();
        v = std::max(512, std::min(131072, v));
        if (v != cfg.n_ctx) { cfg.n_ctx = v; needs_reload = true; }
        db.set_app_setting("n_ctx", std::to_string(v));
    }
    if (body.contains("n_gpu_layers") && body["n_gpu_layers"].is_number_integer()) {
        int v = body["n_gpu_layers"].get<int>();
        v = std::max(0, std::min(999, v));
        if (v != cfg.n_gpu_layers) { cfg.n_gpu_layers = v; needs_reload = true; }
        db.set_app_setting("n_gpu_layers", std::to_string(v));
    }
    if (body.contains("n_batch") && body["n_batch"].is_number_integer()) {
        int v = body["n_batch"].get<int>();
        v = std::max(1, std::min(8192, v));
        if (v != cfg.n_batch) { cfg.n_batch = v; needs_reload = true; }
        db.set_app_setting("n_batch", std::to_string(v));
    }
    if (body.contains("n_threads") && body["n_threads"].is_number_integer()) {
        int v = body["n_threads"].get<int>();
        v = std::max(0, std::min(256, v));
        if (v != cfg.n_threads) { cfg.n_threads = v; needs_reload = true; }
        db.set_app_setting("n_threads", std::to_string(v));
    }

    // Parametros de sampling (se aplican en caliente si el modelo esta cargado)
    if (body.contains("temperature") && body["temperature"].is_number()) {
        float v = body["temperature"].get<float>();
        v = std::max(0.0f, std::min(2.0f, v));
        cfg.temperature = v;
        db.set_app_setting("temperature", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_temperature(v);
    }
    if (body.contains("top_p") && body["top_p"].is_number()) {
        float v = body["top_p"].get<float>();
        v = std::max(0.0f, std::min(1.0f, v));
        cfg.top_p = v;
        db.set_app_setting("top_p", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_top_p(v);
    }
    if (body.contains("max_tokens") && body["max_tokens"].is_number_integer()) {
        int v = body["max_tokens"].get<int>();
        v = std::max(1, std::min(131072, v));
        cfg.max_tokens = v;
        db.set_app_setting("max_tokens", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_max_tokens(v);
    }
    if (body.contains("seed") && body["seed"].is_number_integer()) {
        int v = body["seed"].get<int>();
        cfg.seed = v;
        db.set_app_setting("seed", std::to_string(v));
    }

    // ---- Tuning avanzado: params de carga (requieren recarga) ----
    if (body.contains("n_ubatch") && body["n_ubatch"].is_number_integer()) {
        int v = std::max(0, std::min(8192, body["n_ubatch"].get<int>()));
        if (v != cfg.n_ubatch) { cfg.n_ubatch = v; needs_reload = true; }
        db.set_app_setting("n_ubatch", std::to_string(v));
    }
    if (body.contains("n_threads_batch") && body["n_threads_batch"].is_number_integer()) {
        int v = std::max(0, std::min(256, body["n_threads_batch"].get<int>()));
        if (v != cfg.n_threads_batch) { cfg.n_threads_batch = v; needs_reload = true; }
        db.set_app_setting("n_threads_batch", std::to_string(v));
    }
    if (body.contains("flash_attn") && body["flash_attn"].is_number_integer()) {
        int v = std::max(-1, std::min(1, body["flash_attn"].get<int>()));
        if (v != cfg.flash_attn) { cfg.flash_attn = v; needs_reload = true; }
        db.set_app_setting("flash_attn", std::to_string(v));
    }
    if (body.contains("offload_kqv") && body["offload_kqv"].is_boolean()) {
        bool v = body["offload_kqv"].get<bool>();
        if (v != cfg.offload_kqv) { cfg.offload_kqv = v; needs_reload = true; }
        db.set_app_setting("offload_kqv", v ? "true" : "false");
    }
    if (body.contains("use_mmap") && body["use_mmap"].is_boolean()) {
        bool v = body["use_mmap"].get<bool>();
        if (v != cfg.use_mmap) { cfg.use_mmap = v; needs_reload = true; }
        db.set_app_setting("use_mmap", v ? "true" : "false");
    }
    if (body.contains("use_mlock") && body["use_mlock"].is_boolean()) {
        bool v = body["use_mlock"].get<bool>();
        if (v != cfg.use_mlock) { cfg.use_mlock = v; needs_reload = true; }
        db.set_app_setting("use_mlock", v ? "true" : "false");
    }
    if (body.contains("cache_type_k") && body["cache_type_k"].is_string()) {
        std::string v = body["cache_type_k"].get<std::string>();
        if (v != cfg.cache_type_k) { cfg.cache_type_k = v; needs_reload = true; }
        db.set_app_setting("cache_type_k", v);
    }
    if (body.contains("cache_type_v") && body["cache_type_v"].is_string()) {
        std::string v = body["cache_type_v"].get<std::string>();
        if (v != cfg.cache_type_v) { cfg.cache_type_v = v; needs_reload = true; }
        db.set_app_setting("cache_type_v", v);
    }

    // ---- Tuning avanzado: sampling (en caliente) ----
    if (body.contains("top_k") && body["top_k"].is_number_integer()) {
        int v = std::max(0, std::min(1000, body["top_k"].get<int>()));
        cfg.top_k = v;
        db.set_app_setting("top_k", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_top_k(v);
    }
    if (body.contains("min_p") && body["min_p"].is_number()) {
        float v = std::max(0.0f, std::min(1.0f, body["min_p"].get<float>()));
        cfg.min_p = v;
        db.set_app_setting("min_p", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_min_p(v);
    }
    if (body.contains("repeat_penalty") && body["repeat_penalty"].is_number()) {
        float v = std::max(0.5f, std::min(2.0f, body["repeat_penalty"].get<float>()));
        cfg.repeat_penalty = v;
        db.set_app_setting("repeat_penalty", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_repeat_penalty(v);
    }
    if (body.contains("repeat_last_n") && body["repeat_last_n"].is_number_integer()) {
        int v = std::max(-1, std::min(4096, body["repeat_last_n"].get<int>()));
        cfg.repeat_last_n = v;
        db.set_app_setting("repeat_last_n", std::to_string(v));
        if (core.llm().is_loaded()) core.llm().set_repeat_last_n(v);
    }
    if (body.contains("thinking_enabled") && body["thinking_enabled"].is_boolean()) {
        bool v = body["thinking_enabled"].get<bool>();
        cfg.thinking_enabled = v;
        db.set_app_setting("thinking_enabled", v ? "true" : "false");
    }

    json data;
    data["status"] = "saved";
    data["needs_reload"] = needs_reload;
    json_ok(res, data);
}

// ============================================================================
// Auto-tune de parametros de inferencia
// ============================================================================
void handle_autotune(const httplib::Request& req, httplib::Response& res,
                      AlfredCore& core) {
    auto& gpu = GPUManager::instance();
    gpu.refresh();

    // Calcular tamano del modelo activo (si hay uno cargado o pendiente)
    size_t model_mb = 0;
    // Verificar si hay modelo_path en query params (para calcular sobre un modelo especifico)
    if (req.has_param("model_path")) {
        std::string path = req.get_param_value("model_path");
        std::error_code ec;
        if (std::filesystem::exists(path)) {
            model_mb = static_cast<size_t>(std::filesystem::file_size(path, ec) / (1024 * 1024));
        }
    }

    // Si no se paso modelo, intentar usar el modelo activo
    if (model_mb == 0 && core.llm().is_loaded()) {
        // Buscar archivo del modelo activo en disco
        std::string model_name = core.llm().model_name();
        if (!model_name.empty()) {
            std::string model_path = get_config().models_dir + "/" + model_name;
            std::error_code ec;
            if (std::filesystem::exists(model_path)) {
                model_mb = static_cast<size_t>(std::filesystem::file_size(model_path, ec) / (1024 * 1024));
            }
        }
    }

    auto settings = gpu.auto_tune(model_mb);

    json data;
    data["n_ctx"]        = settings.n_ctx;
    data["n_gpu_layers"] = settings.n_gpu_layers;
    data["n_batch"]      = settings.n_batch;
    data["n_ubatch"]     = settings.n_ubatch;
    data["n_threads"]    = settings.n_threads;
    data["max_tokens"]   = settings.max_tokens;
    data["flash_attn"]   = settings.flash_attn;
    data["offload_kqv"]  = settings.offload_kqv;
    data["cache_type_k"] = settings.cache_type_k;
    data["cache_type_v"] = settings.cache_type_v;

    // Info de hardware detectado
    json hw;
    hw["gpu_available"]  = settings.gpu_available;
    hw["vram_total_mb"]  = settings.vram_total_mb;
    hw["vram_free_mb"]   = settings.vram_free_mb;
    hw["cpu_cores"]      = settings.cpu_cores;
    hw["device_name"]    = gpu.info().device_name;
    hw["model_size_mb"]  = model_mb;
    data["hardware"]     = hw;

    json_ok(res, data);
}

// ============================================================================
// Tokens
// ============================================================================
void handle_token_count(const httplib::Request& req, httplib::Response& res,
                        AlfredCore& core) {
    json body;
    if (!parse_body(req, res, body)) return;

    std::string text = body.value("text", std::string{});
    int n = core.llm().count_tokens(text);
    if (n < 0) {
        // Sin modelo cargado: fallback heuristico 1 token ~ 4 chars.
        n = static_cast<int>(text.size()) / 4;
        json data;
        data["tokens"]   = n;
        data["estimate"] = true;
        data["warning"]  = "Modelo no cargado, usando estimacion aproximada.";
        json_ok(res, data);
        return;
    }
    json data;
    data["tokens"]   = n;
    data["estimate"] = false;
    json_ok(res, data);
}

void handle_token_budget(const httplib::Request& req, httplib::Response& res,
                         AlfredCore& core) {
    const std::string conv_id = req.has_param("conversation_id")
                                ? req.get_param_value("conversation_id") : "";
    const std::string draft   = req.has_param("draft") ? req.get_param_value("draft") : "";

    int context_max         = core.llm().context_length();
    int reserved_for_reply  = get_config().max_tokens;

    std::string system_prompt = core.resolve_system_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS);

    std::vector<ConversationMessage> history;
    if (!conv_id.empty()) {
        history = ConversationManager::instance().get_history(conv_id, 200);
    }

    std::vector<FileTokenInfo> files;
    std::string tools_text;

    auto budget = TokenAccountant::instance().compute(
        core.llm(), context_max, reserved_for_reply,
        system_prompt, history, tools_text, files, draft);

    json_ok(res, budget.to_json());
}

// ============================================================================
// Archivos (extraccion de texto desde PDFs)
// ============================================================================
void handle_extract_pdf(const httplib::Request& req, httplib::Response& res,
                        AlfredCore& core) {
    // Dos modos:
    //  1) multipart/form-data con campo "file"
    //  2) JSON body { "filename": "...", "data_base64": "..." }
    std::string filename;
    std::vector<uint8_t> bytes;

    if (req.form.has_file("file")) {
        const auto f = req.form.get_file("file");
        filename = f.filename;
        bytes.assign(f.content.begin(), f.content.end());
    } else {
        json body;
        if (!parse_body(req, res, body)) return;
        filename = body.value("filename", std::string{"documento.pdf"});
        std::string b64 = body.value("data_base64", std::string{});
        if (b64.empty()) {
            json_error(res, 400, "Falta 'file' (multipart) o 'data_base64' (JSON)");
            return;
        }
        // Decodificar base64
        auto b64_value = [](char c) -> int {
            if (c >= 'A' && c <= 'Z') return c - 'A';
            if (c >= 'a' && c <= 'z') return c - 'a' + 26;
            if (c >= '0' && c <= '9') return c - '0' + 52;
            if (c == '+') return 62;
            if (c == '/') return 63;
            return -1;
        };
        bytes.reserve(b64.size() * 3 / 4);
        int bits = 0, acc = 0;
        for (char c : b64) {
            if (c == '=' || c == '\n' || c == '\r' || c == ' ' || c == '\t') continue;
            int v = b64_value(c);
            if (v < 0) { json_error(res, 400, "base64 invalido"); return; }
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                bytes.push_back(static_cast<uint8_t>((acc >> bits) & 0xFF));
            }
        }
    }

    if (bytes.size() < 4 ||
        !(bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)) {
        json_error(res, 400, "El archivo no parece ser un PDF (cabecera %PDF ausente)");
        return;
    }

    auto pdf = PdfExtractor::extract_from_bytes(bytes.data(), bytes.size(),
                                                &core.llm(), 800, 80);
    if (!pdf.ok) {
        json_error(res, 422, "Error extrayendo PDF: " + pdf.error);
        return;
    }

    json data;
    data["filename"]         = filename;
    data["pages"]            = pdf.pages;
    data["total_tokens"]     = pdf.total_tokens;
    data["text"]             = pdf.full_text();
    json chunks = json::array();
    for (const auto& c : pdf.chunks) {
        chunks.push_back({
            {"page_start", c.page_start},
            {"page_end",   c.page_end},
            {"tokens",     c.tokens},
            {"text",       c.text},
        });
    }
    data["chunks"] = chunks;
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
    if (!get_int_param(req, res, "limit",  limit,  1, 500)) return;
    if (!get_int_param(req, res, "offset", offset, 0, INT_MAX)) return;

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
        std::string content = (m.role == "assistant")
            ? extract_final_response_text(m.content)
            : m.content;
        msgs.push_back({
            {"id", m.id},
            {"role", m.role},
            {"content", content},
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

    try {
        ConversationManager::instance().delete_conversation(id);
        json_ok(res, {{"status", "deleted"}});
    } catch (const std::exception& e) {
        log_error("Error eliminando conversacion: " + std::string(e.what()));
        json_error(res, 500, "No se pudo eliminar la conversacion");
    }
}

void handle_delete_conversations_bulk(const httplib::Request& req, httplib::Response& res) {
    json body;
    if (!parse_body(req, res, body)) return;

    if (!body.contains("ids") || !body["ids"].is_array()) {
        json_error(res, 400, "Campo 'ids' requerido (array)");
        return;
    }

    std::vector<std::string> ids;
    ids.reserve(body["ids"].size());

    for (const auto& it : body["ids"]) {
        if (!it.is_string()) {
            json_error(res, 400, "Todos los IDs deben ser string");
            return;
        }
        std::string id = it.get<std::string>();
        if (!id.empty()) ids.push_back(id);
    }

    if (ids.empty()) {
        json_error(res, 400, "No hay IDs validos para eliminar");
        return;
    }

    try {
        int deleted = ConversationManager::instance().delete_conversations(ids);
        json_ok(res, {
            {"status", "deleted"},
            {"requested", ids.size()},
            {"deleted", deleted}
        });
    } catch (const std::exception& e) {
        log_error("Error en borrado masivo de conversaciones: " + std::string(e.what()));
        json_error(res, 500, "No se pudo completar el borrado masivo");
    }
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

    if (role == "assistant") {
        content = extract_final_response_text(content);
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

    std::string attached_context = extract_attached_context(body);
    std::string full_question = question;
    if (!attached_context.empty()) {
        full_question = "Contexto de archivos adjuntos:\n" + attached_context +
                        "\n\nPregunta del usuario: " + question;
    }

    ConversationManager::instance().add_message(conv_id, "user", question);

    auto result = core.query(full_question, conv_id);

    ConversationManager::instance().add_message(
        conv_id, "assistant", extract_final_response_text(result.answer));

    json data;
    data["answer"] = result.answer;
    data["from_cache"] = result.from_cache;
    data["time_ms"] = result.total_time_ms;
    data["conversation_id"] = conv_id;
    json_ok(res, data);
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
    server.Post("/query/stream", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_query_stream(req, res, core);
    });
    server.Post("/query/cancel", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_query_cancel(req, res, core);
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
    server.Post("/conversations/delete-bulk", [](const httplib::Request& req, httplib::Response& res) {
        handle_delete_conversations_bulk(req, res);
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
    server.Post("/conversations/:id/query/stream", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_conversation_query_stream(req, res, core);
    });

    // Seguridad
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
    server.Delete("/models/:name", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_delete_model(req, res, core);
    });
    server.Post("/models/unload", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_unload_model(req, res, core);
    });
    server.Get("/models/config", [](const httplib::Request& req, httplib::Response& res) {
        handle_get_model_config(req, res);
    });
    server.Post("/models/config", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_set_model_config(req, res, core);
    });
    server.Get("/models/autotune", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_autotune(req, res, core);
    });

    // Tokens
    server.Post("/tokens/count", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_token_count(req, res, core);
    });
    server.Get("/tokens/budget", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_token_budget(req, res, core);
    });

    // Archivos
    server.Post("/files/extract-pdf", [&core](const httplib::Request& req, httplib::Response& res) {
        handle_extract_pdf(req, res, core);
    });

    log_info("Endpoints registrados");
}

} // namespace alfred
