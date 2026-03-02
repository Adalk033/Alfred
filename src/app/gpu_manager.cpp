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
#include <nlohmann/json.hpp>

namespace alfred {

using json = nlohmann::json;

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

void GPUManager::detect() {
    if (detected_) return;
    detected_ = true;

    log_info("Detectando GPU CUDA...");

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

} // namespace alfred
