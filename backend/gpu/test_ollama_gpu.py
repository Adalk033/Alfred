"""
Script de prueba rápida para ver cambios en GPU
Hace una consulta simple a Ollama para que veas el aumento de uso de GPU
"""

import requests
import json
import time

def test_ollama_gpu():
    """Hacer una consulta a Ollama y mostrar estadísticas"""
    
    print("=" * 70)
    print("PRUEBA DE GPU CON OLLAMA")
    print("=" * 70)
    print("\n🔍 Abre otra terminal y ejecuta uno de estos:")
    print("   • python monitor_gpu_usage.py")
    print("   • nvidia-smi -l 1")
    print("   • .\\watch_gpu.ps1")
    print("\nLuego vuelve aquí y presiona ENTER para hacer una consulta...")
    input()
    
    print("\n📤 Enviando consulta a Ollama...")
    print("⏱️  Observa el monitor GPU en la otra terminal - verás:")
    print("   • GPU Usage subir de ~5% a 80-100%")
    print("   • Memory Usage aumentar")
    print("   • Temperatura subir ligeramente\n")
    
    url = "http://localhost:11434/api/generate"
    
    payload = {
        "model": "qwen2.5:7b",
        "prompt": "Explica en 3 líneas qué es la inteligencia artificial.",
        "stream": True
    }
    
    try:
        start_time = time.time()
        response = requests.post(url, json=payload, stream=True, timeout=60)
        
        print("💬 Respuesta de Ollama:")
        print("-" * 70)
        
        full_response = ""
        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line)
                    if 'response' in data:
                        chunk = data['response']
                        print(chunk, end='', flush=True)
                        full_response += chunk
                    
                    if data.get('done', False):
                        break
                except json.JSONDecodeError:
                    continue
        
        elapsed = time.time() - start_time
        
        print("\n" + "-" * 70)
        print(f"✓ Consulta completada en {elapsed:.2f} segundos")
        print("\n🔍 Revisa la otra terminal - deberías haber visto:")
        print("   • GPU Usage en 80-100% durante el procesamiento")
        print("   • Memory Usage aumentó temporalmente")
        print("   • Ahora vuelve a niveles normales (~5%)")
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: No se pudo conectar a Ollama")
        print("   Asegúrate de que Ollama esté corriendo:")
        print("   • ollama serve")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n" + "=" * 70)
    print("PRUEBA COMPLETADA")
    print("=" * 70)
    print("\n💡 Para más pruebas, simplemente ejecuta este script de nuevo")


if __name__ == "__main__":
    test_ollama_gpu()
