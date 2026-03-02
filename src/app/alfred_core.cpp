// ============================================================================
// alfred_core.cpp - Pipeline RAG central
// ============================================================================
// Orquesta: query -> cache LRU -> historial -> retrieve docs -> LLM
// ============================================================================
#include "alfred/alfred_core.h"
#include "alfred/config.h"
#include "alfred/paths.h"
#include "alfred/logger.h"
#include "alfred/gpu_manager.h"
#include "alfred/db_manager.h"
#include "alfred/history_manager.h"
#include "alfred/conversation_manager.h"
#include "alfred/string_utils.h"

#include "llama.h"

#include <chrono>
#include <filesystem>
#include <algorithm>
#include <regex>

namespace alfred {

AlfredCore::AlfredCore()
    : llm_(std::make_unique<LLMEngine>()),
      embedder_(std::make_unique<EmbeddingEngine>()),
      vector_store_(std::make_unique<VectorStore>()) {}

AlfredCore::~AlfredCore() = default;

bool AlfredCore::initialize() {
    log_info("=== Inicializando Alfred Core ===");
    auto& cfg = get_config();

    // 1. Detectar GPU
    log_info("Paso 1/4: Detectando GPU...");
    auto& gpu = GPUManager::instance();
    gpu.detect();
    if (gpu.has_cuda()) {
        log_info(gpu.status_report());
    } else {
        log_warn("Sin GPU CUDA - usando CPU para inferencia");
    }

    // 2. Cargar modelo LLM
    log_info("Paso 2/4: Cargando modelo LLM...");
    std::string llm_path = cfg.models_dir + "/" + cfg.llm_model_file;

    if (!std::filesystem::exists(llm_path)) {
        log_error("Modelo LLM no encontrado: " + llm_path);
        log_error("Descarga un modelo GGUF de HuggingFace y colocalo en: " + cfg.models_dir);
        // Continuar sin LLM - la API estara disponible pero sin generacion
    } else {
        LLMConfig llm_config;
        llm_config.model_path = llm_path;
        llm_config.n_ctx = cfg.n_ctx;
        llm_config.n_gpu_layers = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
        llm_config.n_batch = cfg.n_batch;
        llm_config.temperature = cfg.temperature;
        llm_config.top_p = cfg.top_p;
        llm_config.max_tokens = cfg.max_tokens;
        llm_config.seed = cfg.seed;

        if (!llm_->load_model(llm_config)) {
            log_error("Error cargando modelo LLM");
        }
    }

    // 3. Cargar modelo de embeddings
    log_info("Paso 3/4: Cargando modelo de embeddings...");
    std::string embed_path = cfg.models_dir + "/" + cfg.embed_model_file;

    if (!std::filesystem::exists(embed_path)) {
        log_error("Modelo de embeddings no encontrado: " + embed_path);
        log_error("Descarga un modelo GGUF de embeddings y colocalo en: " + cfg.models_dir);
    } else {
        EmbeddingConfig embed_config;
        embed_config.model_path = embed_path;
        embed_config.n_gpu_layers = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
        embed_config.n_batch = cfg.n_batch;
        embed_config.embedding_dim = cfg.embedding_dim;

        if (!embedder_->load_model(embed_config)) {
            log_error("Error cargando modelo de embeddings");
        }
    }

    // 4. Inicializar vector store
    log_info("Paso 4/4: Inicializando vector store...");
    int dim = embedder_->is_loaded() ? embedder_->dimension() : cfg.embedding_dim;
    vector_store_->initialize(dim, cfg.chroma_dir);

    // Crear retriever
    retriever_ = std::make_unique<SemanticRetriever>(*vector_store_, *embedder_);

    // Cargar perfil de usuario desde DB
    auto& db = DBManager::instance();
    auto name = db.get_user_setting("user_name");
    if (name) cfg.user_name = *name;
    auto age = db.get_user_setting("user_age");
    if (age) cfg.user_age = *age;
    auto occupation = db.get_user_setting("user_occupation");
    if (occupation) cfg.user_occupation = *occupation;
    auto about = db.get_user_setting("about_user");
    if (about) cfg.about_user = *about;

    initialized_ = true;
    log_info("=== Alfred Core inicializado correctamente ===");
    return true;
}

// ============================================================================
// Cache LRU
// ============================================================================
std::optional<QueryResult> AlfredCore::cache_lookup(const std::string& question) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto& cfg = get_config();

    std::string normalized = trim(to_lower(question));
    size_t hash = std::hash<std::string>{}(normalized);

    auto it = query_cache_.find(hash);
    if (it == query_cache_.end()) return std::nullopt;

    // Verificar TTL
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - it->second.timestamp).count();

    if (elapsed > cfg.query_cache_ttl_seconds) {
        query_cache_.erase(it);
        return std::nullopt;
    }

    auto result = it->second.result;
    result.from_cache = true;
    return result;
}

void AlfredCore::cache_insert(const std::string& question, const QueryResult& result) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto& cfg = get_config();

    // Evictar si cache lleno
    if (static_cast<int>(query_cache_.size()) >= cfg.query_cache_max) {
        cache_evict_expired();
        // Si aun esta lleno, eliminar el mas antiguo
        if (static_cast<int>(query_cache_.size()) >= cfg.query_cache_max) {
            auto oldest = query_cache_.begin();
            for (auto it = query_cache_.begin(); it != query_cache_.end(); ++it) {
                if (it->second.timestamp < oldest->second.timestamp) {
                    oldest = it;
                }
            }
            query_cache_.erase(oldest);
        }
    }

    std::string normalized = trim(to_lower(question));
    size_t hash = std::hash<std::string>{}(normalized);
    query_cache_[hash] = {result, std::chrono::steady_clock::now()};
}

void AlfredCore::cache_evict_expired() {
    auto& cfg = get_config();
    auto now = std::chrono::steady_clock::now();

    for (auto it = query_cache_.begin(); it != query_cache_.end();) {
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
            now - it->second.timestamp).count();
        if (elapsed > cfg.query_cache_ttl_seconds) {
            it = query_cache_.erase(it);
        } else {
            ++it;
        }
    }
}

// ============================================================================
// Prompt building
// ============================================================================
std::string AlfredCore::apply_user_profile(const std::string& prompt) {
    auto& cfg = get_config();
    std::string result = prompt;

    auto replace_all = [](std::string& str, const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = str.find(from, pos)) != std::string::npos) {
            str.replace(pos, from.length(), to);
            pos += to.length();
        }
    };

    replace_all(result, "{USER_NAME}", cfg.user_name.empty() ? "Usuario" : cfg.user_name);
    replace_all(result, "{USER_AGE}", cfg.user_age.empty() ? "No especificada" : cfg.user_age);
    replace_all(result, "{USER_OCCUPATION}", cfg.user_occupation.empty() ? "No especificada" : cfg.user_occupation);
    replace_all(result, "{ABOUT_USER}", cfg.about_user.empty() ? "No especificado" : cfg.about_user);
    replace_all(result, "{DATETIME}", get_current_datetime());
    replace_all(result, "{LEARNED_PATTERNS}", ""); // Placeholder para patrones aprendidos

    return result;
}

std::string AlfredCore::build_prompt(const std::string& template_str,
                                      const std::string& context,
                                      const std::string& question) {
    std::string prompt = apply_user_profile(template_str);

    auto replace_all = [](std::string& str, const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = str.find(from, pos)) != std::string::npos) {
            str.replace(pos, from.length(), to);
            pos += to.length();
        }
    };

    replace_all(prompt, "{context}", context);
    replace_all(prompt, "{input}", question);

    return prompt;
}

// ============================================================================
// Query expansion
// ============================================================================
bool AlfredCore::should_expand_query(const std::string& question) {
    // Expandir queries cortas o con siglas
    if (question.size() < 30) return true;

    // Keywords que sugieren busqueda de datos personales
    static const std::vector<std::string> triggers = {
        "rfc", "curp", "nss", "nombre completo", "direccion",
        "fecha de nacimiento", "telefono", "correo"
    };

    std::string lower = to_lower(question);
    for (const auto& trigger : triggers) {
        if (lower.find(trigger) != std::string::npos) return true;
    }

    return false;
}

std::string AlfredCore::expand_query(const std::string& question) {
    if (!llm_->is_loaded()) return question;

    std::string prompt =
        "Reformula la siguiente pregunta en 2-3 formas diferentes para mejorar "
        "la busqueda semantica en documentos. Responde SOLO con las reformulaciones "
        "separadas por newline, sin explicacion.\n\nPregunta: " + question + "\n\nReformulaciones:";

    auto result = llm_->generate(prompt);
    if (!result.success || result.text.empty()) return question;

    return question + " " + result.text;
}

// ============================================================================
// Generacion de respuestas
// ============================================================================
QueryResult AlfredCore::generate_without_documents(
    const std::string& question, const std::string& conversation_context) {
    QueryResult result;

    if (!llm_->is_loaded()) {
        result.answer = "Error: Modelo LLM no cargado. "
                       "Coloca un modelo GGUF en la carpeta de modelos.";
        return result;
    }

    std::string prompt = build_prompt(PROMPT_TEMPLATE_NO_DOCUMENTS,
                                       conversation_context, question);

    auto llm_result = llm_->generate(prompt);

    if (llm_result.success) {
        result.answer = trim(llm_result.text);
    } else {
        result.answer = "Error generando respuesta: " + llm_result.error;
    }

    return result;
}

QueryResult AlfredCore::generate_with_documents(
    const std::string& question, const std::string& conversation_context) {
    QueryResult result;

    if (!llm_->is_loaded() || !embedder_->is_loaded() || !retriever_) {
        result.answer = "Error: Modelos no cargados correctamente.";
        return result;
    }

    auto& cfg = get_config();

    // Expansion de query si es necesario
    std::string search_query = question;
    if (should_expand_query(question)) {
        search_query = expand_query(question);
    }

    // Recuperar documentos relevantes
    RetrievalConfig ret_config;
    ret_config.k = 12;
    ret_config.fetch_k = cfg.fetch_k;
    ret_config.score_threshold = cfg.score_threshold;
    ret_config.mmr_diversity = cfg.mmr_diversity;

    auto retrieval = retriever_->retrieve(search_query, ret_config);

    // Formatear contexto
    std::string doc_context = retriever_->format_context(retrieval.documents, 8000);

    // Combinar contexto de conversacion y documentos
    std::string full_context;
    if (!conversation_context.empty()) {
        full_context = conversation_context + "\n\n--- Documentos encontrados ---\n\n" + doc_context;
    } else {
        full_context = doc_context;
    }

    // Generar respuesta
    std::string prompt = build_prompt(PROMPT_TEMPLATE_WITH_DOCUMENTS,
                                       full_context, question);

    auto llm_result = llm_->generate(prompt);

    if (llm_result.success) {
        result.answer = trim(llm_result.text);

        // Extraer fuentes
        json sources = json::array();
        for (const auto& doc : retrieval.documents) {
            sources.push_back({
                {"source", doc.source_file},
                {"chunk_index", doc.chunk_index},
                {"score", doc.score}
            });
        }
        result.sources = sources.dump();

        // Extraer datos personales si los hay en la respuesta
        auto personal_data = extract_personal_data(result.answer);
        if (!personal_data.rfc.empty() || !personal_data.curp.empty() ||
            !personal_data.nss.empty()) {
            json pd;
            if (!personal_data.rfc.empty()) pd["rfc"] = personal_data.rfc;
            if (!personal_data.curp.empty()) pd["curp"] = personal_data.curp;
            if (!personal_data.nss.empty()) pd["nss"] = personal_data.nss;
            result.personal_data = pd.dump();
        }
    } else {
        result.answer = "Error generando respuesta: " + llm_result.error;
    }

    return result;
}

// ============================================================================
// Query principal
// ============================================================================
QueryResult AlfredCore::query(const std::string& question,
                               bool use_history,
                               bool search_documents,
                               const std::string& conversation_id) {
    auto start = std::chrono::steady_clock::now();
    QueryResult result;

    // 1. Buscar en cache
    auto cached = cache_lookup(question);
    if (cached) {
        log_debug("Respuesta servida desde cache");
        cached->total_time_ms = 0.1;
        return *cached;
    }

    // 2. Buscar en historial Q&A
    if (use_history) {
        auto history_results = HistoryManager::instance().search(question, 0.6f, 1);
        if (!history_results.empty() && history_results[0].score > 0.6f) {
            result.answer = history_results[0].entry.answer;
            result.personal_data = history_results[0].entry.personal_data;
            result.sources = history_results[0].entry.sources;
            result.from_history = true;

            auto end = std::chrono::steady_clock::now();
            result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

            cache_insert(question, result);
            log_debug("Respuesta servida desde historial (score=" +
                      std::to_string(history_results[0].score) + ")");
            return result;
        }
    }

    // 3. Obtener contexto de conversacion
    std::string conversation_context;
    if (!conversation_id.empty()) {
        conversation_context = ConversationManager::instance()
            .format_history_as_context(conversation_id, 50);
    }

    // 4. Generar respuesta
    if (search_documents && vector_store_->count() > 0) {
        result = generate_with_documents(question, conversation_context);
    } else {
        result = generate_without_documents(question, conversation_context);
    }

    auto end = std::chrono::steady_clock::now();
    result.total_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    // 5. Guardar en historial y cache
    if (!result.answer.empty() && result.answer.find("Error") == std::string::npos) {
        HistoryManager::instance().save(question, result.answer,
                                         result.personal_data, result.sources);
        cache_insert(question, result);
    }

    return result;
}

// ============================================================================
// Indexacion de documentos
// ============================================================================
json AlfredCore::index_documents(const std::string& docs_path, bool force_reindex) {
    json stats;

    if (!embedder_->is_loaded()) {
        stats["error"] = "Modelo de embeddings no cargado";
        return stats;
    }

    auto& db = DBManager::instance();

    // Obtener hashes existentes
    auto existing_hashes = force_reindex
        ? std::unordered_map<std::string, std::string>{}
        : db.get_all_document_hashes();

    // Cargar documentos
    auto [documents, metadata_map] = doc_loader_.load_directory(docs_path, existing_hashes);

    if (documents.empty()) {
        stats["message"] = "No hay documentos nuevos o modificados";
        stats["loaded"] = 0;
        return stats;
    }

    // Fragmentar documentos
    auto& chunker = ChunkingManager::instance();
    std::vector<std::pair<std::string, std::string>> doc_pairs;
    for (const auto& doc : documents) {
        doc_pairs.emplace_back(doc.content, doc.metadata.file_path);
    }
    auto chunks = chunker.split_documents_adaptive(doc_pairs);

    // Generar embeddings y agregar al vector store
    std::vector<VectorEntry> entries;
    int processed = 0;

    for (const auto& chunk : chunks) {
        auto embedding = embedder_->embed(chunk.content);
        if (!embedding.empty()) {
            VectorEntry entry;
            entry.embedding = std::move(embedding);
            entry.content = chunk.content;
            entry.source_file = chunk.source_file;
            entry.chunk_index = chunk.chunk_index;
            entry.doc_type = chunk.doc_type;
            entries.push_back(std::move(entry));
            ++processed;
        }
    }

    vector_store_->add(entries);
    vector_store_->save();

    // Actualizar metadatos en DB
    for (const auto& [file_path, meta] : metadata_map) {
        int chunk_count = 0;
        for (const auto& chunk : chunks) {
            if (chunk.source_file == file_path) ++chunk_count;
        }
        db.insert_document_meta(file_path, meta.file_hash, chunk_count);
    }

    stats["documents_loaded"] = documents.size();
    stats["chunks_created"] = chunks.size();
    stats["embeddings_generated"] = processed;
    stats["total_vectors"] = vector_store_->count();

    log_info("Indexacion completada: " + std::to_string(documents.size()) +
             " docs, " + std::to_string(processed) + " embeddings");

    return stats;
}

json AlfredCore::reindex_all() {
    log_info("Re-indexando todos los documentos...");

    // Limpiar vector store
    vector_store_->clear();

    // Obtener rutas activas
    auto paths = DBManager::instance().get_document_paths();
    json total_stats;
    total_stats["paths_processed"] = 0;
    total_stats["total_documents"] = 0;
    total_stats["total_chunks"] = 0;

    for (const auto& dp : paths) {
        if (!dp.enabled) continue;

        auto stats = index_documents(dp.path, true);
        total_stats["paths_processed"] = total_stats["paths_processed"].get<int>() + 1;

        if (stats.contains("documents_loaded")) {
            total_stats["total_documents"] = total_stats["total_documents"].get<int>() +
                                              stats["documents_loaded"].get<int>();
        }
        if (stats.contains("chunks_created")) {
            total_stats["total_chunks"] = total_stats["total_chunks"].get<int>() +
                                           stats["chunks_created"].get<int>();
        }
    }

    return total_stats;
}

void AlfredCore::delete_documents(const std::string& dir_path) {
    vector_store_->remove_by_source(dir_path);
    vector_store_->save();
    log_info("Documentos eliminados del directorio: " + dir_path);
}

bool AlfredCore::change_model(const std::string& model_path) {
    log_info("Cambiando modelo LLM a: " + model_path);

    auto& cfg = get_config();
    auto& gpu = GPUManager::instance();

    LLMConfig llm_config;
    llm_config.model_path = model_path;
    llm_config.n_ctx = cfg.n_ctx;
    llm_config.n_gpu_layers = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
    llm_config.n_batch = cfg.n_batch;
    llm_config.temperature = cfg.temperature;
    llm_config.top_p = cfg.top_p;
    llm_config.max_tokens = cfg.max_tokens;

    llm_->unload_model();
    bool success = llm_->load_model(llm_config);

    if (success) {
        // Persistir en DB
        DBManager::instance().set_model_setting("last_used_model", model_path);
        // Limpiar cache
        clear_cache();
    }

    return success;
}

json AlfredCore::get_stats() {
    json stats;
    stats["initialized"] = initialized_;
    stats["llm_loaded"] = llm_->is_loaded();
    stats["llm_model"] = llm_->model_name();
    stats["embedder_loaded"] = embedder_->is_loaded();
    stats["embedder_model"] = embedder_->model_name();
    stats["embedder_dim"] = embedder_->dimension();
    stats["vector_count"] = vector_store_->count();
    stats["cache_size"] = query_cache_.size();
    stats["gpu"] = json::parse(GPUManager::instance().status_json());
    return stats;
}

void AlfredCore::clear_cache() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    query_cache_.clear();
}

json AlfredCore::get_cache_stats() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    json stats;
    stats["entries"] = query_cache_.size();
    stats["max_entries"] = get_config().query_cache_max;
    stats["ttl_seconds"] = get_config().query_cache_ttl_seconds;
    return stats;
}

json AlfredCore::test_search(const std::string& query_str, int k) {
    json result;
    if (!embedder_->is_loaded() || !retriever_) {
        result["error"] = "Embeddings o retriever no inicializados";
        return result;
    }

    RetrievalConfig config;
    config.k = k;
    config.fetch_k = k * 2;

    auto retrieval = retriever_->retrieve(query_str, config);

    json docs = json::array();
    for (const auto& doc : retrieval.documents) {
        docs.push_back({
            {"content", truncate(doc.content, 200)},
            {"source", doc.source_file},
            {"score", doc.score},
            {"chunk_index", doc.chunk_index}
        });
    }

    result["query"] = query_str;
    result["documents"] = docs;
    result["total_results"] = retrieval.total_results;
    result["retrieval_time_ms"] = retrieval.retrieval_time_ms;
    return result;
}

LLMEngine& AlfredCore::llm() { return *llm_; }
EmbeddingEngine& AlfredCore::embedder() { return *embedder_; }
VectorStore& AlfredCore::vector_store() { return *vector_store_; }
bool AlfredCore::is_initialized() const { return initialized_; }

} // namespace alfred
