// ============================================================================
// gpu_manager.h - Deteccion y gestion de GPU con CUDA
// ============================================================================
// Equivalente a: OldProject/backend/gpu/gpu_manager.py
// Detecta GPUs NVIDIA via CUDA, reporta VRAM disponible,
// y configura parametros de inferencia segun la GPU detectada.
// Ya no usa Ollama - la GPU se gestiona directamente via llama.cpp + CUDA.
// ============================================================================
#pragma once

#include <string>
#include <vector>

namespace alfred {

struct GPUInfo {
    bool available = false;
    std::string device_name;
    std::string driver_version;
    size_t total_vram_mb = 0;
    size_t free_vram_mb = 0;
    size_t used_vram_mb = 0;
    int compute_capability_major = 0;
    int compute_capability_minor = 0;
    int device_count = 0;
};

// Resultado del auto-tune de parametros de inferencia
struct AutoTuneSettings {
    int n_ctx        = 2048;
    int n_gpu_layers = 0;
    int n_batch      = 128;
    int n_threads    = 0;
    int max_tokens   = 1024;
    size_t vram_total_mb = 0;
    size_t vram_free_mb  = 0;
    int cpu_cores        = 0;
    bool gpu_available   = false;
};

class GPUManager {
public:
    static GPUManager& instance();

    // Detectar GPUs disponibles
    void detect();

    // Refrescar info de GPU (re-detectar VRAM actual)
    void refresh();

    // Obtener informacion de GPU
    const GPUInfo& info() const;

    // Tiene GPU CUDA disponible?
    bool has_cuda() const;

    // Obtener VRAM libre en MB
    size_t free_vram_mb() const;

    // Calcular capas optimas para offload a GPU segun VRAM
    int optimal_gpu_layers(size_t model_size_mb) const;

    // Reporte de estado como texto
    std::string status_report() const;

    // Reporte como JSON
    std::string status_json() const;

    // Auto-tune: calcular parametros optimos segun hardware y modelo
    AutoTuneSettings auto_tune(size_t model_size_mb = 0) const;

private:
    GPUManager() = default;
    GPUInfo gpu_info_;
    bool detected_ = false;
};

} // namespace alfred
