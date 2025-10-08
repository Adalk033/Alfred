"""
Script de prueba para verificar que el backend de Alfred funciona correctamente
Ejecuta este script después de iniciar el servidor con: python alfred_backend.py
"""

import requests
import json
import time
from datetime import datetime

# Configuración
BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def print_header(text):
    """Imprime un encabezado formateado"""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60)

def print_success(text):
    """Imprime mensaje de éxito"""
    print(f"[OK] {text}")

def print_error(text):
    """Imprime mensaje de error"""
    print(f"[ERROR] {text}")

def print_info(text):
    """Imprime información"""
    print(f"[INFO] {text}")

def test_connection():
    """Prueba 1: Verificar conexión al servidor"""
    print_header("Prueba 1: Conexión al servidor")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            print_success("Servidor conectado correctamente")
            print_info(f"Servicio: {data.get('service')}")
            print_info(f"Versión: {data.get('version')}")
            print_info(f"Estado: {data.get('status')}")
            return True
        else:
            print_error(f"Estado HTTP inesperado: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("No se pudo conectar al servidor")
        print_info("Asegúrate de que el servidor esté ejecutándose:")
        print_info("  python alfred_backend.py")
        return False
    except Exception as e:
        print_error(f"Error inesperado: {e}")
        return False

def test_health():
    """Prueba 2: Verificar estado de salud"""
    print_header("Prueba 2: Estado de salud")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            print_success("Endpoint de salud responde correctamente")
            print_info(f"Estado: {data.get('status')}")
            print_info(f"Alfred Core inicializado: {data.get('alfred_core_initialized')}")
            print_info(f"Vectorstore cargado: {data.get('vectorstore_loaded')}")
            
            if data.get('status') == 'healthy':
                print_success("Sistema completamente operativo")
                return True
            else:
                print_error("Sistema no está completamente operativo")
                return False
        else:
            print_error(f"Estado HTTP: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_stats():
    """Prueba 3: Obtener estadísticas"""
    print_header("Prueba 3: Estadísticas de la base de datos")
    try:
        response = requests.get(f"{BASE_URL}/stats", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            print_success("Estadísticas obtenidas correctamente")
            print_info(f"Documentos en BD: {data.get('total_documents')}")
            print_info(f"Historial Q&A: {data.get('total_qa_history')}")
            print_info(f"Usuario: {data.get('user_name')}")
            print_info(f"Modelo LLM: {data.get('model_name')}")
            print_info(f"Ruta documentos: {data.get('docs_path')}")
            
            if data.get('total_documents', 0) > 0:
                print_success("Base de datos contiene documentos")
                return True
            else:
                print_error("Base de datos vacía - no hay documentos cargados")
                print_info("Verifica ALFRED_DOCS_PATH en tu archivo .env")
                return False
        else:
            print_error(f"Estado HTTP: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_query():
    """Prueba 4: Realizar una consulta simple"""
    print_header("Prueba 4: Consulta al asistente")
    try:
        query_data = {
            "question": "Hola, ¿cómo estás?",
            "use_history": False,
            "save_response": False
        }
        
        print_info("Enviando consulta...")
        print_info(f"Pregunta: {query_data['question']}")
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/query",
            json=query_data,
            timeout=TIMEOUT
        )
        elapsed_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Consulta procesada en {elapsed_time:.2f} segundos")
            print_info(f"Respuesta: {data.get('answer', '')[:200]}...")
            print_info(f"Desde historial: {data.get('from_history')}")
            print_info(f"Fragmentos recuperados: {data.get('context_count')}")
            
            if data.get('sources'):
                print_info(f"Fuentes: {len(data.get('sources'))} documento(s)")
            
            return True
        else:
            print_error(f"Estado HTTP: {response.status_code}")
            print_error(f"Detalle: {response.text}")
            return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_history():
    """Prueba 5: Verificar historial"""
    print_header("Prueba 5: Historial de conversaciones")
    try:
        response = requests.get(f"{BASE_URL}/history?limit=5", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            print_success(f"Historial obtenido: {len(data)} entradas")
            
            if len(data) > 0:
                print_info("Últimas entradas:")
                for i, entry in enumerate(data[:3], 1):
                    timestamp = entry.get('timestamp', '')
                    question = entry.get('question', '')[:50]
                    print_info(f"  [{i}] {timestamp}: {question}...")
            else:
                print_info("El historial está vacío (esto es normal en la primera ejecución)")
            
            return True
        else:
            print_error(f"Estado HTTP: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_search_history():
    """Prueba 6: Buscar en historial"""
    print_header("Prueba 6: Búsqueda en historial")
    try:
        search_data = {
            "search_term": "RFC",
            "threshold": 0.2,
            "top_k": 5
        }
        
        response = requests.post(
            f"{BASE_URL}/history/search",
            json=search_data,
            timeout=TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Búsqueda completada: {len(data)} resultado(s)")
            
            if len(data) > 0:
                for i, entry in enumerate(data, 1):
                    score = entry.get('similarity_score', 0)
                    question = entry.get('question', '')[:50]
                    print_info(f"  [{i}] Score: {score:.1%} - {question}...")
            else:
                print_info("No se encontraron resultados (el historial está vacío)")
            
            return True
        else:
            print_error(f"Estado HTTP: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def main():
    """Ejecutar todas las pruebas"""
    print("\n" + "🤖" * 30)
    print("    Alfred Backend API - Suite de Pruebas")
    print("🤖" * 30)
    
    tests = [
        ("Conexión al servidor", test_connection),
        ("Estado de salud", test_health),
        ("Estadísticas", test_stats),
        ("Consulta al asistente", test_query),
        ("Historial", test_history),
        ("Búsqueda en historial", test_search_history),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print_error(f"Error crítico en {test_name}: {e}")
            results.append((test_name, False))
        
        time.sleep(0.5)  # Pequeña pausa entre pruebas
    
    # Resumen
    print_header("Resumen de Pruebas")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n📊 Resultado: {passed}/{total} pruebas pasadas")
    
    if passed == total:
        print_success("¡Todas las pruebas pasaron! El backend esta funcionando correctamente.")
        print_info("\n🎉 Alfred esta listo para ser usado desde tu aplicación C#")
        print_info("📚 Consulta la documentación en: http://localhost:8000/docs")
    elif passed > 0:
        print_info(f"Algunas pruebas fallaron. Revisa los errores anteriores.")
    else:
        print_error("Todas las pruebas fallaron. Verifica tu configuración.")
        print_info("\nPasos sugeridos:")
        print_info("1. Verifica que el servidor esté ejecutándose")
        print_info("2. Verifica tu archivo .env")
        print_info("3. Verifica que Ollama esté ejecutándose")
        print_info("4. Revisa los logs del servidor")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nPruebas interrumpidas por el usuario")
    except Exception as e:
        print(f"\n\nError fatal: {e}")
