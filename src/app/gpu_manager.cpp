// ============================================================================
// gpu_manager.cpp - Deteccion y gestion de GPU con CUDA
// ============================================================================
// Detecta GPU NVIDIA usando nvidia-smi y reporta capacidades.
// llama.cpp gestiona CUDA internamente - este modulo solo reporta estado.
// ============================================================================
#include "alfred/gpu_manager.h"
#include "alfred/logger.h"

#include <sstream>
#include <array>
#include <cstdio>
#include <thread>
#include <vector>
#include <algorithm>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace alfred {

using json = nlohmann::json;

#ifdef _WIN32
struct CudaRuntimeProbeResult {
    bool cudart_loaded = false;
    bool cublas_loaded = false;
    std::string cudart_dll;
    std::string cublas_dll;
    bool cuda_api_available = false;
    int device_count = -1;
    std::string status;
};

static CudaRuntimeProbeResult probe_cuda_runtime() {
    CudaRuntimeProbeResult r;

    const char* cudart_candidates[] = {
        "cudart64_13.dll",
        "cudart64_130.dll",
        "cudart64_12.dll",
        "cudart64_120.dll",
        "cudart64_11.dll",
        "cudart64_110.dll"
    };

    const char* cublas_candidates[] = {
        "cublas64_13.dll",
        "cublas64_12.dll",
        "cublas64_11.dll"
    };

    HMODULE cudart = nullptr;
    for (const char* dll : cudart_candidates) {
        cudart = LoadLibraryA(dll);
        if (cudart) {
            r.cudart_loaded = true;
            r.cudart_dll = dll;
            break;
        }
    }

    HMODULE cublas = nullptr;
    for (const char* dll : cublas_candidates) {
        cublas = LoadLibraryA(dll);
        if (cublas) {
            r.cublas_loaded = true;
            r.cublas_dll = dll;
            break;
        }
    }

    if (!cudart) {
        r.status = "CUDA runtime no disponible (cudart DLL no encontrada)";
        if (cublas) FreeLibrary(cublas);
        return r;
    }

    using cudaGetDeviceCountFn = int(*)(int*);
    using cudaGetErrorStringFn = const char*(*)(int);

    auto p_cudaGetDeviceCount = reinterpret_cast<cudaGetDeviceCountFn>(
        GetProcAddress(cudart, "cudaGetDeviceCount"));
    auto p_cudaGetErrorString = reinterpret_cast<cudaGetErrorStringFn>(
        GetProcAddress(cudart, "cudaGetErrorString"));

    if (!p_cudaGetDeviceCount || !p_cudaGetErrorString) {
        r.status = "CUDA runtime cargado pero API incompleta (cudaGetDeviceCount/cudaGetErrorString)";
        if (cublas) FreeLibrary(cublas);
        FreeLibrary(cudart);
        return r;
    }

    r.cuda_api_available = true;
    int count = 0;
    int err = p_cudaGetDeviceCount(&count);
    r.device_count = count;
    const char* err_str = p_cudaGetErrorString(err);
    r.status = err_str ? err_str : "cudaGetErrorString devolvio nullptr";

    if (cublas) FreeLibrary(cublas);
    FreeLibrary(cudart);
    return r;
}
#endif

// Ejecutar comando y capturar salida
static std::string exec_command(const std::string& cmd) {
    std::array<char, 256> buffer;
    std::string result;
#ifdef _WIN32
    std::unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd.c_str(), "r"), _pclose);
#else
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd.c_str(), "r"), pclose);
#endif
    if (!pipe) return "";
    while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe.get()) != nullptr) {
        result += buffer.data();
    }
    return result;
}

GPUManager& GPUManager::instance() {
    static GPUManager mgr;
    return mgr;
}

void GPUManager::refresh() {
    detected_ = false;
    gpu_info_ = GPUInfo{};
    detect();
}

void GPUManager::detect() {
    if (detected_) return;
    detected_ = true;

    log_info("Detectando GPU CUDA...");

#ifdef _WIN32
    auto cuda_probe = probe_cuda_runtime();
    log_info("CUDA runtime cudart: " + std::string(cuda_probe.cudart_loaded ? "OK" : "NO") +
             (cuda_probe.cudart_dll.empty() ? "" : " (" + cuda_probe.cudart_dll + ")"));
    log_info("CUDA runtime cublas: " + std::string(cuda_probe.cublas_loaded ? "OK" : "NO") +
             (cuda_probe.cublas_dll.empty() ? "" : " (" + cuda_probe.cublas_dll + ")"));

    if (!cuda_probe.cudart_loaded) {
        log_warn("CUDA runtime no disponible: faltan DLLs cudart64_*.dll");
    }
    if (!cuda_probe.cublas_loaded) {
        log_warn("CUDA BLAS no disponible: falta cublas64_*.dll");
    }

    if (cuda_probe.cuda_api_available) {
        log_info("CUDA status: " + cuda_probe.status);
        log_info("CUDA device count: " + std::to_string(std::max(0, cuda_probe.device_count)));
    } else {
        log_warn("CUDA API no disponible en runtime: " + cuda_probe.status);
    }
#endif

    // Intentar nvidia-smi para detectar GPU NVIDIA
    std::string output = exec_command(
        "nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,memory.used "
        "--format=csv,noheader,nounits 2>&1"
    );

    if (output.empty() || output.find("NVIDIA") == std::string::npos) {
        // Verificar si nvidia-smi existe pero no encontro GPU
        std::string check = exec_command("nvidia-smi --version 2>&1");
        if (check.find("NVIDIA") != std::string::npos) {
            log_warn("nvidia-smi encontrado pero no hay GPU disponible");
        } else {
            log_info("nvidia-smi no encontrado - sin GPU CUDA disponible");
        }
        gpu_info_.available = false;
        return;
    }

    // Parsear salida CSV: name, driver_version, total_mem, free_mem, used_mem
    std::istringstream stream(output);
    std::string line;
    if (std::getline(stream, line)) {
        std::istringstream line_stream(line);
        std::string name, driver, total_str, free_str, used_str;

        std::getline(line_stream, name, ',');
        std::getline(line_stream, driver, ',');
        std::getline(line_stream, total_str, ',');
        std::getline(line_stream, free_str, ',');
        std::getline(line_stream, used_str, ',');

        // Limpiar whitespace
        auto trim_space = [](std::string& s) {
            size_t start = s.find_first_not_of(" \t");
            if (start != std::string::npos) s = s.substr(start);
            size_t end = s.find_last_not_of(" \t\r\n");
            if (end != std::string::npos) s = s.substr(0, end + 1);
        };

        trim_space(name);
        trim_space(driver);
        trim_space(total_str);
        trim_space(free_str);
        trim_space(used_str);

        gpu_info_.available = true;
        gpu_info_.device_name = name;
        gpu_info_.driver_version = driver;

        try {
            gpu_info_.total_vram_mb = static_cast<size_t>(std::stoul(total_str));
            gpu_info_.free_vram_mb = static_cast<size_t>(std::stoul(free_str));
            gpu_info_.used_vram_mb = static_cast<size_t>(std::stoul(used_str));
        } catch (...) {
            // Si falla el parsing de memoria, aun reportar GPU disponible
        }

        // Contar GPUs
        int count = 1;
        while (std::getline(stream, line)) {
            if (!line.empty()) ++count;
        }
        gpu_info_.device_count = count;

        log_info("GPU detectada: " + gpu_info_.device_name +
                 " (" + std::to_string(gpu_info_.total_vram_mb) + " MB VRAM)");
    }
}

const GPUInfo& GPUManager::info() const {
    return gpu_info_;
}

bool GPUManager::has_cuda() const {
    return gpu_info_.available;
}

size_t GPUManager::free_vram_mb() const {
    return gpu_info_.free_vram_mb;
}

int GPUManager::optimal_gpu_layers(size_t model_size_mb) const {
    if (!gpu_info_.available || gpu_info_.free_vram_mb == 0) return 0;

    // Estimar: necesitamos ~1.2x el tamano del modelo en VRAM
    size_t available = gpu_info_.free_vram_mb;
    size_t needed = static_cast<size_t>(static_cast<double>(model_size_mb) * 1.2);

    if (available >= needed) {
        return 99; // Offload todas las capas
    }

    // Offload parcial proporcional
    double ratio = static_cast<double>(available) / static_cast<double>(needed);
    int layers = static_cast<int>(ratio * 40); // Estimacion para modelos ~40 capas
    return std::max(0, layers);
}

std::string GPUManager::status_report() const {
    std::ostringstream oss;
    oss << "=== Estado GPU ===\n";

    if (!gpu_info_.available) {
        oss << "  GPU CUDA: No disponible\n";
        oss << "  Modo: CPU solamente\n";
    } else {
        oss << "  GPU: " << gpu_info_.device_name << "\n";
        oss << "  Driver: " << gpu_info_.driver_version << "\n";
        oss << "  VRAM Total: " << gpu_info_.total_vram_mb << " MB\n";
        oss << "  VRAM Libre: " << gpu_info_.free_vram_mb << " MB\n";
        oss << "  VRAM Usada: " << gpu_info_.used_vram_mb << " MB\n";
        oss << "  GPUs encontradas: " << gpu_info_.device_count << "\n";
    }

    oss << "==================\n";
    return oss.str();
}

std::string GPUManager::status_json() const {
    json j;
    j["available"] = gpu_info_.available;
    j["device_name"] = gpu_info_.device_name;
    j["driver_version"] = gpu_info_.driver_version;
    j["total_vram_mb"] = gpu_info_.total_vram_mb;
    j["free_vram_mb"] = gpu_info_.free_vram_mb;
    j["used_vram_mb"] = gpu_info_.used_vram_mb;
    j["device_count"] = gpu_info_.device_count;
    return j.dump();
}

AutoTuneSettings GPUManager::auto_tune(size_t model_size_mb) const {
    AutoTuneSettings s;

    // --- Detectar CPU ---
    int hw_threads = static_cast<int>(std::thread::hardware_concurrency());
    // Estimar cores fisicos (heuristica: threads / 2 en x86 con HT)
    int physical_cores = std::max(1, hw_threads / 2);
    s.cpu_cores    = physical_cores;
    s.n_threads    = physical_cores;

    // --- Detectar GPU ---
    s.gpu_available  = gpu_info_.available;
    s.vram_total_mb  = gpu_info_.total_vram_mb;
    s.vram_free_mb   = gpu_info_.free_vram_mb;

    if (!gpu_info_.available || gpu_info_.total_vram_mb == 0) {
        // Sin GPU: configuracion conservadora CPU-only
        s.n_gpu_layers = 0;
        s.n_ctx        = 2048;
        s.n_batch      = 64;
        s.n_ubatch     = 64;
        s.max_tokens   = 1024;
        s.flash_attn   = 0;     // sin GPU, flash attention no aporta
        s.offload_kqv  = false;
        return s;
    }

    size_t vram_gb = gpu_info_.total_vram_mb / 1024;

    // --- Configuracion base segun VRAM total ---
    if (vram_gb <= 6) {
        s.n_gpu_layers = 12;
        s.n_ctx        = 2048;
        s.n_batch      = 128;
    } else if (vram_gb <= 8) {
        s.n_gpu_layers = 24;
        s.n_ctx        = 2048;
        s.n_batch      = 128;
    } else if (vram_gb <= 12) {
        s.n_gpu_layers = 40;
        s.n_ctx        = 4096;
        s.n_batch      = 256;
    } else {
        s.n_gpu_layers = 99;
        s.n_ctx        = 4096;
        s.n_batch      = 512;
    }

    // --- Ajuste por modelo (si se conoce el tamano) ---
    if (model_size_mb > 0) {
        // Estimar VRAM necesaria para el modelo completo (1.2x overhead)
        size_t vram_needed = static_cast<size_t>(model_size_mb * 1.2);

        // Antes de reducir capas, intentamos KV cache cuantizado (ahorra hasta ~75% de KV)
        if (vram_needed > static_cast<size_t>(gpu_info_.free_vram_mb * 0.85)) {
            // Q8_0 ahorra ~50% del KV cache: permite mantener mas capas en GPU
            s.cache_type_k = "q8_0";
            s.cache_type_v = "q8_0";
        }
        if (vram_needed > static_cast<size_t>(gpu_info_.free_vram_mb * 1.2)) {
            // Muy ajustado: Q4_0 ahorra ~75%
            s.cache_type_k = "q4_0";
            s.cache_type_v = "q4_0";
        }

        // Si el modelo no cabe completo en VRAM libre, reducir capas
        if (vram_needed > gpu_info_.free_vram_mb) {
            double ratio = static_cast<double>(gpu_info_.free_vram_mb) /
                           static_cast<double>(vram_needed);
            // Usar ~80% del ratio para dejar margen al contexto
            int safe_layers = static_cast<int>(ratio * 40 * 0.8);
            s.n_gpu_layers = std::max(0, safe_layers);
        }

        // Modelo muy grande (>10 GB) en GPU chica: reducir contexto
        if (model_size_mb > 10000 && vram_gb <= 8) {
            s.n_ctx   = 1024;
            s.n_batch = 64;
        }
    }

    // Flash Attention en AUTO: util en Ampere+ (compute >=8.0), neutral/peor en Turing
    s.flash_attn = -1;
    s.offload_kqv = true;
    s.n_ubatch = s.n_batch;

    // --- Validacion de seguridad: evitar combinaciones peligrosas ---
    // Si n_ctx alto + n_gpu_layers alto + VRAM ajustada, reducir progresivamente
    size_t ctx_vram_estimate = static_cast<size_t>(s.n_ctx) * s.n_gpu_layers / 10;
    size_t total_estimate = (model_size_mb > 0 ? model_size_mb : 4000) + ctx_vram_estimate;

    if (total_estimate > gpu_info_.free_vram_mb && s.n_gpu_layers > 0) {
        // Primero reducir capas GPU
        while (total_estimate > gpu_info_.free_vram_mb && s.n_gpu_layers > 0) {
            s.n_gpu_layers = std::max(0, s.n_gpu_layers - 5);
            ctx_vram_estimate = static_cast<size_t>(s.n_ctx) * s.n_gpu_layers / 10;
            total_estimate = (model_size_mb > 0 ? model_size_mb : 4000) + ctx_vram_estimate;
        }
        // Luego reducir batch si aun no cabe
        if (total_estimate > gpu_info_.free_vram_mb) {
            s.n_batch = std::max(32, s.n_batch / 2);
        }
    }

    // max_tokens = min(n_ctx / 2, 2048)
    s.max_tokens = std::min(s.n_ctx / 2, 2048);

    return s;
}

} // namespace alfred
