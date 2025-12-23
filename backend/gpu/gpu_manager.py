"""
GPU Manager - Gestión automática de GPU para Alfred
Detecta y configura el uso de GPU para modelos de ML
"""

import os
import torch
import platform
from typing import Dict, Optional


class GPUManager:
    """Administrador de GPU para optimización de modelos"""
    
    def __init__(self):
        """Inicializar el gestor de GPU"""
        self._gpu_available = False
        self._gpu_info = {}
        self._device = "cpu"
        self._detect_gpu()
    
    def _detect_gpu(self):
        """Detectar GPU disponible y configurar el dispositivo"""
        try:
            # Verificar CUDA (NVIDIA)
            if torch.cuda.is_available():
                self._gpu_available = True
                self._device = "cuda"
                self._gpu_info = {
                    "type": "NVIDIA CUDA",
                    "device_count": torch.cuda.device_count(),
                    "current_device": torch.cuda.current_device(),
                    "device_name": torch.cuda.get_device_name(0),
                    "memory_total": torch.cuda.get_device_properties(0).total_memory / 1e9,  # GB
                    "cuda_version": torch.version.cuda,
                }
                print(f"GPU NVIDIA detectada: {self._gpu_info['device_name']}")
                print(f"   Memoria: {self._gpu_info['memory_total']:.2f} GB")
                print(f"   CUDA Version: {self._gpu_info['cuda_version']}")
                
            # Verificar ROCm (AMD) si está disponible
            elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
                self._gpu_available = True
                self._device = "cuda"  # PyTorch usa "cuda" también para ROCm
                self._gpu_info = {
                    "type": "AMD ROCm",
                    "device_count": torch.cuda.device_count(),
                    "hip_version": torch.version.hip,
                }
                print(f"GPU AMD detectada (ROCm)")
                
            # Verificar MPS (Apple Silicon)
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                self._gpu_available = True
                self._device = "mps"
                self._gpu_info = {
                    "type": "Apple Metal (MPS)",
                    "platform": platform.processor(),
                }
                print(f"GPU Apple Silicon detectada (Metal)")
                
            else:
                print("No se detectó GPU dedicada, usando CPU")
                self._gpu_info = {
                    "type": "CPU",
                    "processor": platform.processor(),
                }
                
        except Exception as e:
            print(f"Error al detectar GPU: {e}")
            self._gpu_available = False
            self._device = "cpu"
            self._gpu_info = {"type": "CPU (fallback)"}
    
    @property
    def has_gpu(self) -> bool:
        """Verificar si hay GPU disponible"""
        return self._gpu_available
    
    @property
    def device(self) -> str:
        """Obtener el dispositivo a usar (cuda, mps, o cpu)"""
        return self._device
    
    @property
    def device_type(self) -> str:
        """Obtener el tipo de dispositivo legible"""
        return self._gpu_info.get("type", "Unknown")
    
    @property
    def gpu_info(self) -> Dict:
        """Obtener información detallada de la GPU"""
        return self._gpu_info.copy()
    
    def configure_ollama_for_gpu(self) -> Dict[str, str]:
        """
        Configurar variables de entorno para Ollama
        Returns: Dict con las variables de entorno configuradas
        """
        env_vars = {}
        
        if self._gpu_available:
            if self._device == "cuda":
                # Configurar para NVIDIA/AMD
                env_vars["OLLAMA_GPU"] = "1"
                
                # Configurar capas de GPU (todas las capas en GPU si es posible)
                if "device_count" in self._gpu_info and self._gpu_info["device_count"] > 0:
                    env_vars["OLLAMA_NUM_GPU"] = str(self._gpu_info["device_count"])
                
                # Limitar memoria si es necesario (opcional)
                # env_vars["OLLAMA_MAX_VRAM"] = "8192"  # MB
                
                print(f"Ollama configurado para usar GPU {self.device_type}")
                
            elif self._device == "mps":
                # Apple Silicon
                env_vars["OLLAMA_GPU"] = "1"
                print(f"Ollama configurado para Apple Metal")
                
        else:
            # Forzar CPU si no hay GPU
            env_vars["OLLAMA_GPU"] = "0"
            print(f"Ollama configurado para usar CPU")
        
        # Aplicar variables de entorno
        for key, value in env_vars.items():
            os.environ[key] = value
        
        return env_vars
    
    def get_torch_device(self) -> torch.device:
        """Obtener el dispositivo de PyTorch para usar"""
        return torch.device(self._device)
    
    def optimize_for_inference(self):
        """Aplicar optimizaciones para inferencia"""
        if self._gpu_available and self._device == "cuda":
            # Optimizaciones para CUDA
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.deterministic = False
            print("Optimizaciones CUDA aplicadas")
        
        # Optimización general
        torch.set_num_threads(os.cpu_count() or 4)
    
    def get_memory_usage(self) -> Optional[Dict]:
        """Obtener uso de memoria de GPU"""
        if not self._gpu_available:
            return None
        
        try:
            if self._device == "cuda":
                return {
                    "allocated": torch.cuda.memory_allocated(0) / 1e9,  # GB
                    "reserved": torch.cuda.memory_reserved(0) / 1e9,  # GB
                    "max_allocated": torch.cuda.max_memory_allocated(0) / 1e9,  # GB
                }
        except Exception as e:
            print(f"Error al obtener uso de memoria: {e}")
            return None
    
    def clear_cache(self):
        """Limpiar caché de GPU"""
        if self._gpu_available and self._device == "cuda":
            try:
                torch.cuda.empty_cache()
                print("Caché de GPU limpiado")
            except Exception as e:
                print(f"Error al limpiar caché: {e}")
    
    def get_status_report(self) -> str:
        """Obtener reporte del estado de GPU"""
        lines = []
        lines.append("=" * 50)
        lines.append("GPU Manager - Estado del Sistema")
        lines.append("=" * 50)
        lines.append(f"Dispositivo: {self.device_type}")
        lines.append(f"PyTorch Device: {self._device}")
        lines.append(f"GPU Disponible: {'Sí' if self._gpu_available else 'No'}")
        
        if self._gpu_available:
            for key, value in self._gpu_info.items():
                if key != "type":
                    lines.append(f"  {key}: {value}")
            
            # Memoria si está disponible
            mem = self.get_memory_usage()
            if mem:
                lines.append(f"\nUso de Memoria:")
                lines.append(f"  Asignada: {mem['allocated']:.2f} GB")
                lines.append(f"  Reservada: {mem['reserved']:.2f} GB")
                lines.append(f"  Máxima asignada: {mem['max_allocated']:.2f} GB")
        
        lines.append("=" * 50)
        return "\n".join(lines)


# Instancia global
_gpu_manager = None


def get_gpu_manager() -> GPUManager:
    """Obtener instancia global del gestor de GPU"""
    print("Obteniendo instancia de GPUManager...")
    global _gpu_manager
    if _gpu_manager is None:
        _gpu_manager = GPUManager()
    return _gpu_manager


if __name__ == "__main__":
    # Prueba del módulo
    manager = get_gpu_manager()
    print(manager.get_status_report())
    manager.configure_ollama_for_gpu()
