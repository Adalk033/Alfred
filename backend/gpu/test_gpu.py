"""
Script de prueba para verificar la detección y uso de GPU
"""

from gpu_manager import get_gpu_manager
import torch


def test_gpu_detection():
    """Probar detección de GPU"""
    print("\n" + "="*60)
    print("PRUEBA DE DETECCIÓN DE GPU")
    print("="*60 + "\n")
    
    manager = get_gpu_manager()
    
    # Mostrar reporte completo
    print(manager.get_status_report())
    
    # Información adicional de PyTorch
    print("\nInformación adicional de PyTorch:")
    print(f"  Versión PyTorch: {torch.__version__}")
    print(f"  CUDA disponible: {torch.cuda.is_available()}")
    
    if torch.cuda.is_available():
        print(f"  CUDA versión: {torch.version.cuda}")
        print(f"  cuDNN versión: {torch.backends.cudnn.version()}")
        print(f"  Número de GPUs: {torch.cuda.device_count()}")
        
        for i in range(torch.cuda.device_count()):
            print(f"\n  GPU {i}:")
            print(f"    Nombre: {torch.cuda.get_device_name(i)}")
            props = torch.cuda.get_device_properties(i)
            print(f"    Memoria Total: {props.total_memory / 1e9:.2f} GB")
            print(f"    Compute Capability: {props.major}.{props.minor}")
    
    # Probar configuración de Ollama
    print("\n" + "="*60)
    print("CONFIGURACIÓN DE OLLAMA")
    print("="*60 + "\n")
    
    env_vars = manager.configure_ollama_for_gpu()
    print("\nVariables de entorno configuradas:")
    for key, value in env_vars.items():
        print(f"  {key}={value}")
    
    # Probar optimizaciones
    print("\n" + "="*60)
    print("OPTIMIZACIONES")
    print("="*60 + "\n")
    
    manager.optimize_for_inference()
    
    # Prueba de tensor en GPU
    if manager.has_gpu:
        print("\nPrueba de operación en GPU:")
        try:
            device = manager.get_torch_device()
            test_tensor = torch.randn(1000, 1000).to(device)
            result = torch.matmul(test_tensor, test_tensor)
            print(f"  ✓ Operación exitosa en {device}")
            print(f"  Tensor shape: {result.shape}")
            
            # Limpiar
            del test_tensor, result
            manager.clear_cache()
            
        except Exception as e:
            print(f"  ✗ Error en operación: {e}")
    
    print("\n" + "="*60)
    print("PRUEBA COMPLETADA")
    print("="*60 + "\n")


if __name__ == "__main__":
    test_gpu_detection()
