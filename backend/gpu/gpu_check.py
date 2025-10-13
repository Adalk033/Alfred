"""
GPU Check - Detección automática de GPU y almacenamiento en JSON
Detecta NVIDIA CUDA, AMD ROCm y Apple Silicon MPS
"""

import json
import os
import platform
from pathlib import Path
from datetime import datetime

def check_gpu():
    """
    Detecta GPU disponible y retorna información detallada
    
    Returns:
        dict: Información de GPU detectada
    """
    gpu_info = {
        "timestamp": datetime.now().isoformat(),
        "platform": platform.system(),
        "platform_version": platform.version(),
        "python_version": platform.python_version(),
        "gpu_available": False,
        "gpu_type": "none",
        "device": "cpu",
        "details": {}
    }
    
    try:
        import torch
        
        # Verificar CUDA (NVIDIA)
        if torch.cuda.is_available():
            gpu_info.update({
                "gpu_available": True,
                "gpu_type": "nvidia_cuda",
                "device": "cuda",
                "details": {
                    "device_count": torch.cuda.device_count(),
                    "current_device": torch.cuda.current_device(),
                    "device_name": torch.cuda.get_device_name(0),
                    "cuda_version": torch.version.cuda,
                    "memory_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1e9, 2),
                    "memory_allocated_gb": round(torch.cuda.memory_allocated(0) / 1e9, 2),
                    "memory_reserved_gb": round(torch.cuda.memory_reserved(0) / 1e9, 2),
                }
            })
            print(f"[OK] GPU NVIDIA detectada: {gpu_info['details']['device_name']}")
            print(f"   Memoria total: {gpu_info['details']['memory_total_gb']} GB")
            print(f"   CUDA version: {gpu_info['details']['cuda_version']}")
            
        # Verificar ROCm (AMD)
        elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
            gpu_info.update({
                "gpu_available": True,
                "gpu_type": "amd_rocm",
                "device": "cuda",  # PyTorch usa "cuda" también para ROCm
                "details": {
                    "device_count": torch.cuda.device_count(),
                    "hip_version": torch.version.hip,
                }
            })
            print(f"[OK] GPU AMD detectada (ROCm)")
            print(f"   HIP version: {gpu_info['details']['hip_version']}")
            
        # Verificar MPS (Apple Silicon)
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            gpu_info.update({
                "gpu_available": True,
                "gpu_type": "apple_mps",
                "device": "mps",
                "details": {
                    "mps_built": torch.backends.mps.is_built(),
                }
            })
            print(f"[OK] GPU Apple Silicon detectada (MPS)")
            
        else:
            print("[WARN] No se detecto GPU compatible")
            print("   Se usara CPU para procesamiento")
            gpu_info["details"]["message"] = "CPU fallback - no GPU detected"
            
    except ImportError:
        print("[WARN] PyTorch no esta instalado")
        print("   Instala con: pip install torch")
        gpu_info["details"]["error"] = "PyTorch not installed"
        
    except Exception as e:
        print(f"[ERROR] Error al detectar GPU: {str(e)}")
        gpu_info["details"]["error"] = str(e)
    
    return gpu_info


def save_gpu_info(gpu_info: dict, output_file: str = None):
    """
    Guarda información de GPU en archivo JSON
    
    Args:
        gpu_info: Diccionario con información de GPU
        output_file: Ruta del archivo de salida (opcional)
    """
    if output_file is None:
        # Guardar en el directorio del script
        script_dir = Path(__file__).parent
        output_file = script_dir / "gpu_info.json"
    
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(gpu_info, f, indent=2, ensure_ascii=False)
    
    print(f"\n[INFO] Informacion guardada en: {output_path}")


def load_gpu_info(input_file: str = None) -> dict:
    """
    Carga información de GPU desde archivo JSON
    
    Args:
        input_file: Ruta del archivo de entrada (opcional)
        
    Returns:
        dict: Información de GPU o dict vacío si no existe
    """
    if input_file is None:
        script_dir = Path(__file__).parent
        input_file = script_dir / "gpu_info.json"
    
    input_path = Path(input_file)
    
    if not input_path.exists():
        return {}
    
    with open(input_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def check_ollama_gpu():
    """
    Verifica si Ollama puede usar GPU
    """
    import subprocess
    
    print("\n[INFO] Verificando Ollama...")
    
    try:
        # Verificar si Ollama está instalado
        result = subprocess.run(['ollama', 'version'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        
        if result.returncode == 0:
            print(f"[OK] Ollama instalado: {result.stdout.strip()}")
            
            # Verificar si el servicio esta corriendo
            try:
                result = subprocess.run(['ollama', 'list'], 
                                      capture_output=True, 
                                      text=True, 
                                      timeout=5)
                if result.returncode == 0:
                    print("[OK] Servicio Ollama activo")
                    return True
                else:
                    print("[WARN] Servicio Ollama no responde")
                    print("   Inicia con: ollama serve")
                    return False
            except subprocess.TimeoutExpired:
                print("[WARN] Timeout al contactar Ollama")
                return False
        else:
            print("[ERROR] Ollama no esta instalado")
            print("   Descarga desde: https://ollama.ai/")
            return False
            
    except FileNotFoundError:
        print("[ERROR] Ollama no encontrado en PATH")
        print("   Descarga desde: https://ollama.ai/")
        return False
    except Exception as e:
        print(f"[ERROR] Error al verificar Ollama: {str(e)}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Alfred GPU Check - Detección de Hardware")
    print("=" * 60)
    print()
    
    # Detectar GPU
    gpu_info = check_gpu()
    
    # Verificar Ollama
    ollama_available = check_ollama_gpu()
    gpu_info["ollama_available"] = ollama_available
    
    # Guardar resultado
    save_gpu_info(gpu_info)
    
    print()
    print("=" * 60)
    print("Resumen:")
    print(f"  GPU disponible: {gpu_info['gpu_available']}")
    print(f"  Tipo: {gpu_info['gpu_type']}")
    print(f"  Dispositivo: {gpu_info['device']}")
    print(f"  Ollama: {'Disponible' if ollama_available else 'No disponible'}")
    print("=" * 60)
