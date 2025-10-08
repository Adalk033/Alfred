"""
Demo rápida de la funcionalidad de GPU en Alfred
"""

print("="*60)
print("ALFRED - DEMO DE GPU")
print("="*60)
print()

print("1. Importando módulos...")
from gpu_manager import get_gpu_manager

print("2. Inicializando gestor de GPU...")
gpu = get_gpu_manager()

print("\n" + "="*60)
print("DETECCIÓN DE HARDWARE")
print("="*60)

print(f"\n✓ GPU detectada: {'SÍ' if gpu.has_gpu else 'NO'}")
print(f"✓ Tipo de dispositivo: {gpu.device_type}")
print(f"✓ PyTorch device: {gpu.device}")

if gpu.has_gpu:
    info = gpu.gpu_info
    print(f"\nℹ️ Información detallada:")
    for key, value in info.items():
        if key != 'type':
            print(f"   • {key}: {value}")

print("\n" + "="*60)
print("CONFIGURACIÓN DE OLLAMA")
print("="*60)

env_vars = gpu.configure_ollama_for_gpu()
print("\nVariables configuradas:")
for key, value in env_vars.items():
    print(f"   • {key} = {value}")

print("\n" + "="*60)
print("OPTIMIZACIONES")
print("="*60)

gpu.optimize_for_inference()
print("\n✓ Optimizaciones aplicadas")

if gpu.has_gpu:
    print("\n" + "="*60)
    print("PRUEBA DE GPU")
    print("="*60)
    
    print("\nProbando operación en GPU...")
    import torch
    
    try:
        device = gpu.get_torch_device()
        
        # Crear tensor en GPU
        tensor = torch.randn(100, 100).to(device)
        result = torch.matmul(tensor, tensor)
        
        print(f"✓ Operación exitosa en {device}")
        print(f"✓ Shape del resultado: {result.shape}")
        
        # Ver memoria
        memory = gpu.get_memory_usage()
        if memory:
            print(f"\n💾 Memoria GPU:")
            print(f"   • Asignada: {memory['allocated']:.4f} GB")
            print(f"   • Reservada: {memory['reserved']:.4f} GB")
        
        # Limpiar
        del tensor, result
        gpu.clear_cache()
        print("\n✓ Memoria limpiada")
        
    except Exception as e:
        print(f"✗ Error: {e}")

print("\n" + "="*60)
print("RECOMENDACIONES")
print("="*60)

if gpu.has_gpu:
    print("""
✓ GPU detectada correctamente

Recomendaciones:
• Usar modelos más grandes (gemma2:9b, llama3:8b)
• Aumentar k en retriever para más contexto
• Procesar documentos en lotes más grandes

Para iniciar Alfred:
    python alfred.py
""")
else:
    print("""
ℹ️ No se detectó GPU - Usando CPU

Recomendaciones:
• Usar modelos más pequeños (gemma2:2b)
• Reducir k en retriever
• Considerar menos documentos simultáneos

Para verificar GPU (NVIDIA):
    nvidia-smi

Para instalar PyTorch con CUDA:
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

Para iniciar Alfred:
    python alfred.py
""")

print("="*60)
print("DEMO COMPLETADA")
print("="*60)
