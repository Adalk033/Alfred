"""
===================================================================================
AVISO: Este script CLI esta DEPRECADO
===================================================================================
Este script standalone (alfred.py) aun usa ALFRED_DOCS_PATH del archivo .env.

El sistema principal de Alfred ahora gestiona documentos completamente desde la UI:
  - Rutas configuradas por el usuario en la interfaz grafica
  - Almacenadas en SQLite (tabla document_paths)
  - Gestionadas via API REST (endpoints /documents/*)
  - Sin necesidad de editar .env

Para usar Alfred correctamente:
  1. Inicia el servidor: python backend/core/alfred_backend.py
  2. Abre la aplicacion Electron
  3. Ve a la seccion de Gestion de Documentos
  4. Agrega tus rutas de documentos desde la UI
  5. Haz clic en "Reindexar Documentos"

Este script se mantiene solo para testing/debugging legacy.
===================================================================================
"""

import os
from dotenv import load_dotenv
import sys
from pathlib import Path

# Agregar directorios al path de Python para imports
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
sys.path.insert(0, str(backend_root / "core"))
sys.path.insert(0, str(backend_root / "gpu"))
sys.path.insert(0, str(backend_root / "utils"))

from langchain_ollama import OllamaLLM
from langchain_community.document_loaders import DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.vectorstores.utils import filter_complex_metadata
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.document_loaders import UnstructuredFileLoader
from datetime import datetime
import re

# --- 1. Configuración Inicial ---
import config
import functionsToHistory
from gpu_manager import get_gpu_manager

print("\n" + "="*80)
print("ADVERTENCIA: Script CLI deprecado - Usar aplicacion Electron con UI de gestion")
print("="*80 + "\n")

load_dotenv()  # Carga el .env

# Inicializar gestor de GPU
gpu_manager = get_gpu_manager()
gpu_manager.configure_ollama_for_gpu()
gpu_manager.optimize_for_inference()

# Obtener la ruta desde variable de entorno (solo para compatibilidad legacy)
DOCS_PATH = os.getenv('ALFRED_DOCS_PATH')
if not DOCS_PATH:
    print("Error: Define la variable de entorno ALFRED_DOCS_PATH")
    print("   Ejemplo: $env:ALFRED_DOCS_PATH='C:\\Users\\YOUR_PATH\\Documents'")
    print("\nNOTA: Este script esta deprecado. Considera usar la aplicacion Electron.")
    sys.exit(1)

CHROMA_DB_PATH = "./chroma_db"
FORCE_RELOAD = os.getenv('ALFRED_FORCE_RELOAD', 'false').lower() == 'true'
QA_HISTORY_FILE = "./alfred_qa_history.json"

# --- Función auxiliar para extraer datos estructurados ---
def extract_personal_data(text):
    """Extrae RFC, CURP y otros datos personales del texto"""
    patterns = {
        'RFC': r'RFC[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})',
        'CURP': r'CURP[:\s]*([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)',
        'NSS': r'NSS[:\s]*(\d{11})',
    }
    
    found_data = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            found_data[key] = match.group(1)
    
    return found_data

# --- Función para cargar y procesar documentos ---
def load_and_process_documents():
    """Carga todos los documentos, crea embeddings y guarda en ChromaDB"""
    print("Cargando documentos personales...")
    
    loader = DirectoryLoader(
        DOCS_PATH, 
        glob="**/*", 
        show_progress=True,
        silent_errors=True,
        use_multithreading=True,
        loader_cls=UnstructuredFileLoader,
    )
    
    docs = []
    not_readable_file = ".notReadable"
    
    try:
        docs = loader.load()
    except Exception as e:
        print(f"Advertencia al cargar algunos archivos: {e}")
    
    # Verificar archivos no legibles
    print("Verificando archivos...")
    failed_files = []
    for file_path in Path(DOCS_PATH).rglob("*"):
        if file_path.is_file():
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    f.read(100)
            except Exception as e:
                failed_files.append(str(file_path))
                print(f"No se pudo leer: {file_path}")
    
    if failed_files:
        with open(not_readable_file, 'a', encoding='utf-8') as f:
            for failed_file in failed_files:
                f.write(f"{failed_file}\n")
        print(f"{len(failed_files)} archivos no legibles guardados en {not_readable_file}")
    
    print(f"{len(docs)} documentos cargados exitosamente")
    
    # Dividir en chunks con configuración optimizada
    print("Dividiendo documentos en chunks...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=3000,  # Chunks mucho más grandes para capturar contexto completo
        chunk_overlap=600,  # Mayor solapamiento para no perder información entre chunks
        add_start_index=True,
        separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""],  # Separadores que respetan estructura
        keep_separator=True  # Mantener separadores para contexto
        )
    splits = text_splitter.split_documents(docs)
    print(f"{len(splits)} chunks creados")
    
    # Filtrar metadata compleja (listas, diccionarios anidados, etc.)
    print("Limpiando metadata compleja...")
    splits = filter_complex_metadata(splits)
    
    # Crear embeddings y vectorstore
    print("Creando embeddings y almacenando en la base de datos vectorial...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text:v1.5")
    vectorstore = Chroma.from_documents(
        documents=splits, 
        embedding=embeddings, 
        persist_directory=CHROMA_DB_PATH
    )
    print("Base de datos vectorial creada!")
    return vectorstore

# --- Verificar si existe la base de datos o forzar recarga ---
if os.path.exists(CHROMA_DB_PATH) and not FORCE_RELOAD:
    print("Base de datos existente encontrada. Cargando...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text:v1.5")
    vectorstore = Chroma(
        persist_directory=CHROMA_DB_PATH,
        embedding_function=embeddings
    )
    print("Base de datos cargada desde disco")
    
    # Diagnóstico: verificar contenido de la base de datos
    try:
        collection = vectorstore._collection
        count = collection.count()
        print(f"Estadísticas de la base de datos:")
        print(f"   - Documentos en ChromaDB: {count}")
        if count == 0:
            print("   La base de datos está VACÍA. Recarga con ALFRED_FORCE_RELOAD='true'")
    except Exception as e:
        print(f"No se pudo verificar el contenido de la BD: {e}")
else:
    if FORCE_RELOAD:
        print("Forzando recarga de documentos...")
    else:
        print("Primera ejecución. Procesando documentos...")
    vectorstore = load_and_process_documents()


# --- 4. Definir el LLM y el Prompt ---
# Usar un modelo más rápido y eficiente
llm = OllamaLLM(model="gemma2:9b")

# Cargar el nombre desde la variable de entorno
USER_NAME = os.getenv('ALFRED_USER_NAME', 'Usuario')  # Valor predeterminado: 'Usuario'
print(f"Usando el nombre de usuario: {USER_NAME}")

# El prompt le dice al LLM cómo usar el contexto recuperado
prompt_template = config.PROMPT_TEMPLATE
prompt_template = prompt_template.replace("{USER_NAME}", USER_NAME)
prompt = ChatPromptTemplate.from_template(prompt_template)

# --- 5. Crear la Cadena de Recuperación (Retrieval Chain) ---
# Esta cadena combina todo: recupera documentos y luego genera una respuesta
# Configurar el retriever con más resultados y mejor búsqueda
retriever = vectorstore.as_retriever(
    search_type="mmr",  # Tipo de búsqueda: "similarity" (similitud) o "mmr" (diversidad)
    search_kwargs={
        "k": 20,  # 🔢 NÚMERO DE DOCUMENTOS A RECUPERAR (aumenta este valor para buscar en más docs)
        "fetch_k": 100  # 🔍 DOCUMENTOS A ANALIZAR antes de filtrar (cuanto mayor, más exhaustiva la búsqueda)
    }
)
document_chain = create_stuff_documents_chain(llm, prompt)
retrieval_chain = create_retrieval_chain(retriever, document_chain)


# --- Bucle de Interacción ---
if __name__ == "__main__":
    print("\n" + "="*60)
    print("AVISO: Modo CLI de Alfred")
    print("="*60)
    print("Este es el modo de línea de comandos (CLI) de Alfred.")
    print("\nPara usar Alfred como backend API con C#:")
    print("   1. Ejecuta: python alfred_backend.py")
    print("   2. Accede a: http://localhost:8000/docs")
    print("   3. Consulta: README_BACKEND.md")
    print("\nDocumentación:")
    print("   - QUICKSTART.md  : Inicio rápido")
    print("   - DEPLOYMENT.md  : Configuración avanzada")
    print("   - AlfredClient.cs: Cliente para C#")
    print("="*60)
    
    continuar = input("\n¿Deseas continuar con el modo CLI? (s/n): ").strip().lower()
    if continuar not in ['s', 'si', 'sí', 'y', 'yes', '']:
        print("\nPara iniciar el backend, ejecuta:")
        print("   python alfred_backend.py")
        print("   o")
        print("   .\\start_alfred_server.ps1")
        sys.exit(0)
    
    print("\nAsistente personal listo. Escribe 'salir' para terminar.")
    print("Alfred ahora busca primero en respuestas previas para optimizar velocidad!")
    print("\nComandos especiales:")
    print("   - 'test'    : Prueba directa de búsqueda en la base de datos")
    print("   - 'stats'   : Muestra estadísticas de la base de datos")
    print("   - 'history' : Muestra el historial de Q&A guardadas")
    print("   - 'search'  : Busca en el historial de respuestas guardadas (mejorado con IA)")

    
    while True:
        user_input = input("\nTú: ")
        if user_input.lower() in ['salir', 'exit']:
            break
        
        # Comando especial: prueba directa
        if user_input.lower() == 'test':
            test_query = input("Escribe una palabra clave para buscar: ")
            results = vectorstore.similarity_search(test_query, k=5)
            print(f"\nBúsqueda directa encontró {len(results)} resultados:")
            for i, doc in enumerate(results, 1):
                print(f"\n[Resultado {i}]")
                print(f"Fuente: {doc.metadata.get('source', 'Desconocido')}")
                print(f"Contenido: {doc.page_content[:500]}...")
            continue
        
        # Comando especial: estadísticas
        if user_input.lower() == 'stats':
            try:
                collection = vectorstore._collection
                count = collection.count()
                print(f"\nEstadísticas:")
                print(f"   - Total de documentos en ChromaDB: {count}")
                print(f"   - Q&A guardadas en historial: {len(functionsToHistory.load_qa_history(QA_HISTORY_FILE))}")
                # Obtener algunos ejemplos
                if count > 0:
                    sample = collection.peek(limit=3)
                    print(f"   - IDs de ejemplo: {sample['ids'][:3]}")
            except Exception as e:
                print(f"Error: {e}")
            continue
        
        # Comando especial: estado de GPU
        if user_input.lower() == 'gpu':
            print("\n" + gpu_manager.get_status_report())
            memory = gpu_manager.get_memory_usage()
            if memory:
                print("\nUso actual de memoria GPU:")
                print(f"   - Asignada: {memory['allocated']:.2f} GB")
                print(f"   - Reservada: {memory['reserved']:.2f} GB")
                print(f"   - Máxima asignada: {memory['max_allocated']:.2f} GB")
                
                clear = input("\n¿Limpiar caché de GPU? (s/n): ")
                if clear.lower() == 's':
                    gpu_manager.clear_cache()
                    print("Caché limpiado")
            continue
        
        # Comando especial: ver historial de Q&A
        if user_input.lower() == 'history':
            history = functionsToHistory.load_qa_history(QA_HISTORY_FILE)
            if not history:
                print("\nNo hay preguntas guardadas en el historial.")
            else:
                print(f"\nHistorial de Q&A ({len(history)} entradas):")
                for i, entry in enumerate(reversed(history[-10:]), 1):  # Últimas 10
                    timestamp = datetime.fromisoformat(entry['timestamp']).strftime("%Y-%m-%d %H:%M")
                    print(f"\n[{i}] {timestamp}")
                    print(f"P: {entry['question']}")
                    print(f"R: {entry['answer'][:150]}...")
                    if entry.get('personal_data'):
                        print(f"Datos: {', '.join([f'{k}={v}' for k,v in entry['personal_data'].items()])}")
            continue
        
        # Comando especial: buscar en historial
        if user_input.lower() == 'search':
            search_term = input("¿Qué quieres buscar en el historial? ")
            
            # Usar la nueva función de búsqueda mejorada
            history_results = functionsToHistory.search_in_qa_history(search_term, threshold=0.2, top_k=10)
            
            if not history_results:
                print(f"\nNo se encontró '{search_term}' en el historial.")
            else:
                print(f"\nEncontradas {len(history_results)} coincidencias (ordenadas por relevancia):")
                for i, (score, entry) in enumerate(history_results, 1):
                    timestamp = datetime.fromisoformat(entry['timestamp']).strftime("%Y-%m-%d %H:%M")
                    print(f"\n[{i}] Relevancia: {score:.1%} | {timestamp}")
                    print(f"P: {entry['question']}")
                    print(f"R: {entry['answer'][:200]}{'...' if len(entry['answer']) > 200 else ''}")
                    if entry.get('personal_data'):
                        print(f"Datos: {', '.join([f'{k}={v}' for k,v in entry['personal_data'].items()])}")
            continue
    
        # PASO 1: Buscar primero en el historial de Q&A
        print("Buscando en historial de respuestas previas...")
        history_results = functionsToHistory.search_in_qa_history(user_input)
        
        # Si encontramos una respuesta muy relevante en el historial (score > 0.6), usarla
        if history_results and history_results[0][0] > 0.6:
            score, best_match = history_results[0]
            
            print(f"\nEncontré una respuesta previa muy relevante! (Similitud: {score:.1%})")
            print(f"Fecha: {datetime.fromisoformat(best_match['timestamp']).strftime('%Y-%m-%d %H:%M')}")
            print(f"Pregunta anterior: {best_match['question']}")
            
            # Mostrar la respuesta del historial
            final_answer = best_match['answer']
            print(f"\nAlfred (desde historial): {final_answer}")
            
            # Mostrar datos personales si los hay
            if best_match.get('personal_data'):
                print(f"\nDatos asociados:")
                for key, value in best_match['personal_data'].items():
                    print(f"   {key}: {value}")
            
            # Preguntar si la respuesta del historial fue útil
            use_history = input("\n¿Esta respuesta del historial es suficiente? (s/n/Enter=sí): ").strip().lower()
            
            if use_history in ['', 's', 'si', 'sí', 'yes', 'y']:
                print("Respuesta obtenida del historial (más rápido y eficiente)")
                continue  # Saltar la búsqueda en ChromaDB
            else:
                print("Realizando búsqueda completa en documentos...")
        elif history_results:
            # Mostrar resultados con menor score como sugerencias
            print(f"\nEncontré {len(history_results)} respuesta(s) relacionada(s) en el historial:")
            for i, (score, entry) in enumerate(history_results, 1):
                print(f"   [{i}] (Similitud: {score:.1%}) {entry['question'][:60]}...")
            print("   Realizando búsqueda completa para mejor precisión...\n")
        else:
            print("No se encontraron respuestas previas similares.")
            print("Buscando en documentos completos...\n")
        
        # PASO 2: Búsqueda completa en ChromaDB (si no se usó historial)
        # Invocar la cadena con la pregunta del usuario
        response = retrieval_chain.invoke({"input": user_input})
        
        # Debug mejorado: mostrar fragmentos completos con scores
        print(f"\nFragmentos recuperados: {len(response.get('context', []))}")
        
        if not response.get('context'):
            print("NO se encontraron documentos relevantes. Posibles causas:")
            print("   - Los documentos no están cargados correctamente")
            print("   - La consulta no coincide con el contenido")
            print("   - Intenta recargar con: $env:ALFRED_FORCE_RELOAD='true'; python alfred.py")
        
        # Extraer datos estructurados de TODOS los fragmentos
        all_personal_data = {}
        for doc in response['context']:
            personal_data = extract_personal_data(doc.page_content)
            all_personal_data.update(personal_data)
        
        # Mostrar datos encontrados automáticamente
        if all_personal_data:
            print(f"\nDatos personales encontrados automáticamente:")
            for key, value in all_personal_data.items():
                print(f"   {key}: {value}")
            print()
        
        # Si el usuario preguntó por RFC o CURP y lo encontramos, responder directamente
        user_input_lower = user_input.lower()
        final_answer = ""
        
        if ('rfc' in user_input_lower or 'curp' in user_input_lower or 'nss' in user_input_lower) and all_personal_data:
            answer_parts = []
            answer_parts.append("Encontré la siguiente información en tus documentos:")
            for key, value in all_personal_data.items():
                if key.lower() in user_input_lower:
                    answer_parts.append(f"Tu {key} es: {value}")
            
            final_answer = "\n   ".join(answer_parts)
            print(f"\nAlfred: {final_answer}")
            
            # Mostrar opcionalmente los fragmentos en modo debug
            show_debug = os.getenv('ALFRED_DEBUG', 'false').lower() == 'true'
            if show_debug:
                print("\n[Modo Debug - Fragmentos recuperados]")
                for i, doc in enumerate(response['context'], 1):
                    print(f"\n[Fragmento {i}]")
                    print(f"Fuente: {doc.metadata.get('source', 'Desconocido')}")
                    print("-" * 80)
                    content = doc.page_content
                    if len(content) > 300:
                        print(f"{content[:300]}...")
                    else:
                        print(content)
                    print("-" * 80)
        else:
            # Usar la respuesta del LLM para preguntas generales
            final_answer = response['answer']
            print(f"\nAlfred: {final_answer}")
        
        # Preguntar si desea guardar la respuesta
        save_response = input("\n¿Guardar esta respuesta? (s/n/Enter=no): ").strip().lower()
        
        if save_response == 's' or save_response == 'si' or save_response == 'sí':
            # Obtener fuentes de los documentos
            sources = list(set([doc.metadata.get('source', 'Desconocido') for doc in response['context']]))
            
            # Guardar en historial
            if functionsToHistory.save_qa_to_history(
                question=user_input,
                answer=final_answer,
                personal_data=all_personal_data if all_personal_data else None,
                sources=sources,
                QA_HISTORY_FILE=QA_HISTORY_FILE
            ):
                print("Respuesta guardada en el historial!")
            else:
                print("No se pudo guardar la respuesta.")