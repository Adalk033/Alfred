"""
Alfred Backend API - FastAPI Server
Asistente personal inteligente con acceso a documentos locales
Diseñado para ser consumido por aplicaciones C# y otros clientes
"""

import sys
import io
import os
from pathlib import Path

# Agregar directorios al path de Python para imports
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
sys.path.insert(0, str(backend_root / "core"))
sys.path.insert(0, str(backend_root / "gpu"))
sys.path.insert(0, str(backend_root / "utils"))

from utils.logger import get_logger

# Configurar encoding UTF-8 para evitar errores con caracteres especiales en Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager

# Importar módulos locales
import functionsToHistory
from alfred_core import AlfredCore
from conversation_manager import get_conversation_manager
from utils.security import encrypt_data, decrypt_data
from functionsToHistory import encrypt_personal_data, decrypt_personal_data

# --- Modelos de datos para la API ---

class QueryRequest(BaseModel):
    """Solicitud de consulta al asistente"""
    question: str = Field(..., description="Pregunta del usuario", min_length=1)
    use_history: bool = Field(True, description="Buscar primero en el historial")
    save_response: bool = Field(False, description="Guardar respuesta automáticamente")
    search_documents: bool = Field(True, description="Buscar en documentos o solo usar el prompt")
    search_kwargs: Optional[Dict[str, Any]] = Field(
        None, 
        description="Parámetros adicionales de búsqueda (k, fetch_k, etc.)"
    )

class QueryResponse(BaseModel):
    """Respuesta del asistente"""
    answer: str = Field(..., description="Respuesta generada por Alfred")
    personal_data: Optional[Dict[str, str]] = Field(None, description="Datos personales extraídos")
    sources: List[str] = Field(default_factory=list, description="Fuentes de los documentos")
    from_history: bool = Field(False, description="Si la respuesta proviene del historial")
    history_score: Optional[float] = Field(None, description="Score de similitud con historial")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    context_count: int = Field(0, description="Número de fragmentos recuperados")

class HistorySearchRequest(BaseModel):
    """Solicitud de búsqueda en historial"""
    search_term: str = Field(..., description="Término a buscar", min_length=1)
    threshold: float = Field(0.2, description="Umbral de similitud", ge=0.0, le=1.0)
    top_k: int = Field(10, description="Número máximo de resultados", ge=1, le=50)

class HistoryEntry(BaseModel):
    """Entrada del historial"""
    timestamp: str
    question: str
    answer: str
    personal_data: Optional[Dict[str, str]] = None
    sources: List[str] = Field(default_factory=list)
    similarity_score: Optional[float] = None

class SaveHistoryRequest(BaseModel):
    """Solicitud para guardar en historial"""
    question: str
    answer: str
    personal_data: Optional[Dict[str, str]] = None
    sources: Optional[List[str]] = None

class DatabaseStats(BaseModel):
    """Estadísticas de la base de datos"""
    total_documents: int
    total_qa_history: int
    chroma_db_path: str
    docs_path: str
    user_name: str
    model_name: str
    status: str

class ModelInfo(BaseModel):
    """Información del modelo actual"""
    model_name: str
    available_models: List[str] = Field(default_factory=list)

class ChangeModelRequest(BaseModel):
    """Solicitud para cambiar el modelo"""
    model_name: str = Field(..., description="Nombre del nuevo modelo a utilizar")

class GPUStatus(BaseModel):
    """Estado de la GPU"""
    gpu_available: bool
    device_type: str
    device: str
    gpu_info: Dict[str, Any] = Field(default_factory=dict)
    memory_usage: Optional[Dict[str, float]] = None

class HealthResponse(BaseModel):
    """Estado de salud del servicio"""
    status: str
    timestamp: str
    alfred_core_initialized: bool
    vectorstore_loaded: bool
    gpu_status: Optional[GPUStatus] = None

# --- Modelos de Conversaciones ---

class ConversationMessage(BaseModel):
    """Mensaje dentro de una conversacion"""
    role: str = Field(..., description="Rol del mensaje: 'user' o 'assistant'")
    content: str = Field(..., description="Contenido del mensaje")
    timestamp: str = Field(..., description="Timestamp del mensaje")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")

class ConversationDetail(BaseModel):
    """Detalle completo de una conversacion"""
    id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ConversationMessage]

class ConversationSummary(BaseModel):
    """Resumen de una conversacion para listados"""
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int

class CreateConversationRequest(BaseModel):
    """Solicitud para crear una nueva conversacion"""
    title: Optional[str] = Field(None, description="Titulo de la conversacion (opcional)")

class AddMessageRequest(BaseModel):
    """Solicitud para agregar un mensaje a una conversacion"""
    conversation_id: str = Field(..., description="ID de la conversacion")
    role: str = Field(..., description="Rol del mensaje: 'user' o 'assistant'")
    content: str = Field(..., description="Contenido del mensaje")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Metadata adicional")

class UpdateTitleRequest(BaseModel):
    """Solicitud para actualizar el titulo de una conversacion"""
    title: str = Field(..., description="Nuevo titulo", min_length=1)

class QueryWithConversationRequest(BaseModel):
    """Solicitud de consulta con historial de conversacion"""
    question: str = Field(..., description="Pregunta del usuario", min_length=1)
    conversation_id: Optional[str] = Field(None, description="ID de la conversacion activa")
    use_history: bool = Field(True, description="Buscar primero en el historial Q&A")
    save_response: bool = Field(False, description="Guardar respuesta en historial Q&A")
    search_documents: bool = Field(True, description="Buscar en documentos o solo usar el prompt")
    search_kwargs: Optional[Dict[str, Any]] = Field(None, description="Parametros adicionales de busqueda")
    max_context_messages: int = Field(50, description="Numero maximo de mensajes de contexto", ge=1, le=50)

class OllamaKeepAliveRequest(BaseModel):
    """Solicitud para actualizar el keep_alive de Ollama"""
    seconds: int = Field(..., description="Tiempo en segundos (0-3600)", ge=0, le=3600)

class OllamaKeepAliveResponse(BaseModel):
    """Respuesta con el keep_alive actual"""
    keep_alive_seconds: int = Field(..., description="Tiempo en segundos")
    description: str = Field(..., description="Descripcion del comportamiento")

# --- Inicialización del núcleo de Alfred ---
alfred_core: Optional[AlfredCore] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manejo del ciclo de vida de la aplicación"""
    global alfred_core
    
    # IMPORTANTE: Usar sys.stdout.flush() para forzar salida inmediata en Windows
    import sys
    
    print("\n" + "="*60, flush=True)
    print("Iniciando Alfred Backend API...", flush=True)
    print("="*60, flush=True)
    sys.stdout.flush()
    
    try:
        # Inicializar el núcleo de Alfred
        print("Creando instancia de AlfredCore...", flush=True)
        alfred_core = AlfredCore()
        print("\n" + "="*60, flush=True)
        print("Alfred Core inicializado correctamente", flush=True)
        print("="*60 + "\n", flush=True)
        sys.stdout.flush()
        yield
    except Exception as e:
        print(f"\nError al inicializar Alfred Core: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        raise
    finally:
        print("\n" + "="*60, flush=True)
        print("Cerrando Alfred Backend API...", flush=True)
        print("="*60 + "\n", flush=True)
        sys.stdout.flush()
        # Aquí podrías agregar limpieza si es necesaria


backend_logger = get_logger("server")
rag_logger = get_logger("rag")
security_logger = get_logger("security")

# Log de inicio
backend_logger.info(f"Iniciando backend Alfred en {os.getenv('ALFRED_IP', 'Not found')}:{os.getenv('ALFRED_PORT', 'Not found')}")
rag_logger.info(f"Iniciando RAG en {os.getenv('ALFRED_RAG_IP', 'Not found')}:{os.getenv('ALFRED_RAG_PORT', 'Not found')}")
security_logger.info(f"Iniciando seguridad en {os.getenv('ALFRED_SECURITY_IP', 'Not found')}:{os.getenv('ALFRED_SECURITY_PORT', 'Not found')}")

# --- Funciones auxiliares de cifrado ---

def ensure_personal_data_decrypted(data: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """
    Asegura que los datos personales esten descifrados antes de enviarlos al cliente
    
    Args:
        data: Diccionario con datos personales (potencialmente cifrados)
    
    Returns:
        Diccionario con datos descifrados o None
    """
    if not data:
        return None
    
    try:
        # Intentar descifrar cada campo
        decrypted = {}
        for key, value in data.items():
            if value and isinstance(value, str):
                try:
                    # Intentar descifrar
                    decrypted[key] = decrypt_data(value)
                    security_logger.debug(f"Campo {key} descifrado exitosamente")
                except Exception:
                    # Si falla, asumir que ya esta descifrado
                    decrypted[key] = value
            else:
                decrypted[key] = value
        return decrypted
    except Exception as e:
        security_logger.error(f"Error al descifrar datos personales: {e}")
        return data  # Devolver datos originales en caso de error

def log_personal_data_access(operation: str, data_keys: List[str], user_context: str = "API"):
    """
    Registra el acceso a datos personales para auditoria
    
    Args:
        operation: Tipo de operacion (read, write, delete)
        data_keys: Claves de los datos accedidos (rfc, curp, etc.)
        user_context: Contexto del usuario/cliente
    """
    security_logger.info(
        f"Acceso a datos personales: {operation} | "
        f"Campos: {', '.join(data_keys)} | "
        f"Contexto: {user_context} | "
        f"Timestamp: {datetime.now().isoformat()}"
    )

# --- Crear aplicación FastAPI ---
app = FastAPI(
    title="Alfred Backend API",
    description="Asistente personal inteligente con acceso a documentos locales",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc"  # ReDoc
)

# --- Configurar CORS para permitir peticiones desde C# ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especifica los orígenes permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Endpoints ---

@app.get("/", tags=["General"])
async def root():
    """Endpoint raíz - Información del servicio"""
    return {
        "service": "Alfred Backend API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", response_model=HealthResponse, tags=["General"])
async def health_check():
    """Verificar el estado de salud del servicio"""
    gpu_status_data = None
    
    if alfred_core:
        gpu_mgr = alfred_core.gpu_manager
        gpu_status_data = GPUStatus(
            gpu_available=gpu_mgr.has_gpu,
            device_type=gpu_mgr.device_type,
            device=gpu_mgr.device,
            gpu_info=gpu_mgr.gpu_info,
            memory_usage=gpu_mgr.get_memory_usage()
        )
    
    return HealthResponse(
        status="healthy" if alfred_core and alfred_core.is_initialized() else "unhealthy",
        timestamp=datetime.now().isoformat(),
        alfred_core_initialized=alfred_core is not None,
        vectorstore_loaded=alfred_core.is_initialized() if alfred_core else False,
        gpu_status=gpu_status_data
    )

@app.post("/query", response_model=QueryResponse, tags=["Consultas"])
async def query_alfred(request: QueryRequest):
    """
    Realizar una consulta a Alfred
    
    **NOTA DE SEGURIDAD**: Los datos personales se cifran automaticamente antes de almacenarlos
    y se descifran antes de enviarlos al cliente.
    
    - **question**: Pregunta del usuario
    - **use_history**: Buscar primero en el historial de respuestas
    - **save_response**: Guardar automáticamente la respuesta en el historial (con cifrado)
    - **search_documents**: Buscar en documentos o solo usar el prompt
    - **search_kwargs**: Parámetros adicionales para la búsqueda (k, fetch_k, etc.)
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        print(f"Procesando consulta: {request.question[:50]}...")
        
        # Ejecutar consulta
        result = alfred_core.query(
            question=request.question,
            use_history=request.use_history,
            search_documents=request.search_documents,
            search_kwargs=request.search_kwargs
        )
        
        print(f"Consulta procesada exitosamente")
        
        # Asegurar que los datos personales esten descifrados para el cliente
        personal_data = ensure_personal_data_decrypted(result.get('personal_data'))
        
        # Registrar acceso a datos personales si existen
        if personal_data:
            log_personal_data_access(
                operation="read",
                data_keys=list(personal_data.keys()),
                user_context=f"Query: {request.question[:30]}..."
            )
        
        # Guardar en historial si se solicita (se cifra automaticamente)
        if request.save_response and not result.get('from_history', False):
            functionsToHistory.save_qa_to_history(
                question=request.question,
                answer=result['answer'],
                personal_data=personal_data,
                sources=result.get('sources', []),
                encrypt_sensitive=True  # Cifrado explicito
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context="Guardado en historial"
                )
        
        return QueryResponse(
            answer=result['answer'],
            personal_data=personal_data,
            sources=result.get('sources', []),
            from_history=result.get('from_history', False),
            history_score=result.get('history_score'),
            context_count=result.get('context_count', 0)
        )
    
    except Exception as e:
        # Sanitizar el mensaje de error para evitar problemas de encoding
        error_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        if not error_msg:
            error_msg = "Error desconocido al procesar la consulta"
        
        print(f"Error al procesar consulta: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error al procesar consulta: {error_msg}")

@app.post("/history/search", response_model=List[HistoryEntry], tags=["Historial"])
async def search_history(request: HistorySearchRequest):
    """
    Buscar en el historial de preguntas y respuestas
    
    **NOTA DE SEGURIDAD**: Los datos personales se descifran automaticamente antes de ser enviados.
    
    - **search_term**: Término a buscar
    - **threshold**: Umbral de similitud (0.0 - 1.0)
    - **top_k**: Número máximo de resultados
    """
    try:
        # Buscar en historial (descifra automaticamente)
        results = functionsToHistory.search_in_qa_history(
            question=request.search_term,
            threshold=request.threshold,
            top_k=request.top_k
        )
        
        history_entries = []
        for score, entry in results:
            personal_data = ensure_personal_data_decrypted(entry.get('personal_data'))
            
            # Registrar acceso si hay datos personales
            if personal_data:
                log_personal_data_access(
                    operation="read",
                    data_keys=list(personal_data.keys()),
                    user_context=f"Busqueda en historial: {request.search_term[:30]}..."
                )
            
            history_entries.append(
                HistoryEntry(
                    timestamp=entry['timestamp'],
                    question=entry['question'],
                    answer=entry['answer'],
                    personal_data=personal_data,
                    sources=entry.get('sources', []),
                    similarity_score=score
                )
            )
        
        return history_entries
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar en historial: {str(e)}")

@app.get("/history", response_model=List[HistoryEntry], tags=["Historial"])
async def get_history(limit: int = 10, offset: int = 0):
    """
    Obtener el historial de preguntas y respuestas
    
    **NOTA DE SEGURIDAD**: Los datos personales se descifran automaticamente antes de ser enviados.
    
    - **limit**: Número máximo de entradas a devolver
    - **offset**: Número de entradas a saltar (para paginación)
    """
    try:
        # Cargar historial (descifra automaticamente)
        history = functionsToHistory.load_qa_history(decrypt_sensitive=True)
        
        # Aplicar paginación
        paginated = history[offset:offset + limit]
        
        history_entries = []
        for entry in reversed(paginated):  # Más recientes primero
            personal_data = ensure_personal_data_decrypted(entry.get('personal_data'))
            
            # Registrar acceso si hay datos personales
            if personal_data:
                log_personal_data_access(
                    operation="read",
                    data_keys=list(personal_data.keys()),
                    user_context="Listado de historial"
                )
            
            history_entries.append(
                HistoryEntry(
                    timestamp=entry['timestamp'],
                    question=entry['question'],
                    answer=entry['answer'],
                    personal_data=personal_data,
                    sources=entry.get('sources', [])
                )
            )
        
        return history_entries
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener historial: {str(e)}")

@app.post("/history/save", tags=["Historial"])
async def save_to_history(request: SaveHistoryRequest):
    """
    Guardar manualmente una entrada en el historial
    
    **NOTA DE SEGURIDAD**: Los datos personales se cifran automaticamente antes de almacenarlos.
    
    - **question**: Pregunta
    - **answer**: Respuesta
    - **personal_data**: Datos personales extraídos (opcional)
    - **sources**: Fuentes de los documentos (opcional)
    """
    try:
        # Registrar acceso a datos personales si existen
        if request.personal_data:
            log_personal_data_access(
                operation="write",
                data_keys=list(request.personal_data.keys()),
                user_context="Guardado manual en historial"
            )
        
        # Guardar en historial (cifra automaticamente)
        success = functionsToHistory.save_qa_to_history(
            question=request.question,
            answer=request.answer,
            personal_data=request.personal_data,
            sources=request.sources or [],
            encrypt_sensitive=True  # Cifrado explicito
        )
        
        if success:
            return {"status": "success", "message": "Entrada guardada en el historial (cifrada)"}
        else:
            raise HTTPException(status_code=500, detail="Error al guardar en el historial")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.delete("/history/{timestamp}", tags=["Historial"])
async def delete_history_entry(timestamp: str):
    """
    Eliminar una entrada del historial por su timestamp
    
    **NOTA DE SEGURIDAD**: La eliminacion de datos sensibles se registra en el log de auditoria.
    
    - **timestamp**: Timestamp ISO de la entrada a eliminar
    """
    try:
        # Cargar entrada antes de eliminar para logging
        history = functionsToHistory.load_qa_history(decrypt_sensitive=False)
        entry_to_delete = next((e for e in history if e.get('timestamp') == timestamp), None)
        
        if entry_to_delete and entry_to_delete.get('personal_data'):
            log_personal_data_access(
                operation="delete",
                data_keys=list(entry_to_delete['personal_data'].keys()),
                user_context=f"Eliminacion de entrada: {timestamp}"
            )
        
        success = functionsToHistory.delete_qa_from_history(timestamp)
        
        if success:
            return {"status": "success", "message": "Entrada eliminada del historial"}
        else:
            raise HTTPException(status_code=404, detail="No se encontro la entrada con ese timestamp")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar del historial: {str(e)}")

@app.get("/stats", response_model=DatabaseStats, tags=["Estadísticas"])
async def get_stats():
    """Obtener estadísticas de la base de datos y configuración"""
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        stats = alfred_core.get_stats()
        return DatabaseStats(**stats)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas: {str(e)}")

@app.post("/reload", tags=["Mantenimiento"])
async def reload_documents(background_tasks: BackgroundTasks):
    """
    Recargar documentos desde el directorio configurado
    (Operación pesada, se ejecuta en background)
    """
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        # Ejecutar recarga en segundo plano
        background_tasks.add_task(alfred_core.reload_documents)
        return {
            "status": "started",
            "message": "Recarga de documentos iniciada en segundo plano"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al recargar documentos: {str(e)}")

@app.get("/documents/test", tags=["Desarrollo"])
async def test_search(query: str, k: int = 5):
    """
    Realizar una búsqueda directa en la base de datos vectorial (para testing)
    
    - **query**: Consulta de búsqueda
    - **k**: Número de resultados a devolver
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        results = alfred_core.test_search(query, k)
        return {
            "query": query,
            "results_count": len(results),
            "results": [
                {
                    "source": doc.metadata.get('source', 'Desconocido'),
                    "content_preview": doc.page_content[:300] + "..." if len(doc.page_content) > 300 else doc.page_content
                }
                for doc in results
            ]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al realizar búsqueda: {str(e)}")

@app.get("/model", response_model=ModelInfo, tags=["Configuración"])
async def get_current_model():
    """
    Obtener el modelo actual y los modelos disponibles
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        current_model = alfred_core.get_current_model()
        # Lista de modelos disponibles (puedes expandir esto según tus necesidades)
        available_models = ["gemma2:9b", "gpt-oss:20b", "gemma3:12b", "gemma3:4b", "gemma3:1b", "gemma3n:e4b"]
        
        return ModelInfo(
            model_name=current_model,
            available_models=available_models
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener información del modelo: {str(e)}")

@app.post("/model", tags=["Configuración"])
async def change_model(request: ChangeModelRequest):
    """
    Cambiar el modelo LLM actual
    
    - **model_name**: Nombre del nuevo modelo a utilizar
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        success = alfred_core.change_model(request.model_name)
        
        if success:
            return {
                "status": "success",
                "message": f"Modelo cambiado exitosamente a {request.model_name}",
                "model_name": request.model_name
            }
        else:
            raise HTTPException(status_code=500, detail="Error al cambiar el modelo")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al cambiar modelo: {str(e)}")

@app.get("/gpu/status", response_model=GPUStatus, tags=["Sistema"])
async def get_gpu_status():
    """
    Obtener el estado actual de la GPU
    
    Retorna información detallada sobre:
    - Si hay GPU disponible
    - Tipo de GPU (NVIDIA, AMD, Apple Silicon)
    - Uso de memoria (si está disponible)
    - Información del dispositivo
    """
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        gpu_mgr = alfred_core.gpu_manager
        return GPUStatus(
            gpu_available=gpu_mgr.has_gpu,
            device_type=gpu_mgr.device_type,
            device=gpu_mgr.device,
            gpu_info=gpu_mgr.gpu_info,
            memory_usage=gpu_mgr.get_memory_usage()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estado de GPU: {str(e)}")

@app.get("/gpu/report", tags=["Sistema"])
async def get_gpu_report():
    """
    Obtener un reporte detallado del estado de la GPU en formato de texto
    """
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    try:
        gpu_mgr = alfred_core.gpu_manager
        report = gpu_mgr.get_status_report()
        return {
            "report": report,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar reporte: {str(e)}")

@app.post("/ollama/stop", tags=["Configuración"])
async def stop_ollama(background_tasks: BackgroundTasks):
    """
    Detener el servicio de Ollama manualmente para liberar recursos
    
    Ejecuta el comando 'ollama stop <modelo>' para descargar el modelo de la memoria
    Se ejecuta en segundo plano para no bloquear la respuesta
    """
    import subprocess
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no está inicializado")
    
    # Obtener el modelo actual
    current_model = alfred_core.get_current_model()
    
    # Función para ejecutar en segundo plano
    def stop_ollama_background():
        try:
            print(f"[Background] Intentando detener modelo: {current_model}")
            
            # Ejecutar comando ollama stop con el nombre del modelo
            result = subprocess.run(
                ["ollama", "stop", current_model],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            print(f"[Background] Resultado del comando: returncode={result.returncode}")
            print(f"[Background] stdout: {result.stdout}")
            print(f"[Background] stderr: {result.stderr}")
            
            if result.returncode == 0:
                print(f"[Background] Modelo {current_model} detenido exitosamente")
            else:
                print(f"[Background] Error al detener modelo: {result.stderr}")
                
        except Exception as e:
            print(f"[Background] Excepción al detener Ollama: {str(e)}")
    
    # Agregar tarea en segundo plano
    background_tasks.add_task(stop_ollama_background)
    
    # Responder inmediatamente sin esperar
    return {
        "status": "success",
        "message": f"Deteniendo modelo {current_model} en segundo plano. Los recursos se liberaran en unos segundos.",
        "model": current_model
    }

@app.get("/ollama/keep-alive", response_model=OllamaKeepAliveResponse, tags=["Configuración"])
async def get_ollama_keep_alive():
    """
    Obtener el tiempo de keep_alive actual de Ollama
    
    El keep_alive controla cuanto tiempo Ollama mantiene el modelo en memoria
    despues de usarlo. Despues de este tiempo sin uso, el modelo se descarga
    automaticamente para liberar recursos.
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        keep_alive = alfred_core.get_ollama_keep_alive()
        
        if keep_alive == 0:
            description = "El modelo se descarga inmediatamente despues de cada uso"
        elif keep_alive < 60:
            description = f"El modelo permanece en memoria {keep_alive} segundos despues de cada uso"
        elif keep_alive < 3600:
            minutes = keep_alive // 60
            description = f"El modelo permanece en memoria {minutes} minuto(s) despues de cada uso"
        else:
            hours = keep_alive // 3600
            description = f"El modelo permanece en memoria {hours} hora(s) despues de cada uso"
        
        return OllamaKeepAliveResponse(
            keep_alive_seconds=keep_alive,
            description=description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener keep_alive: {str(e)}")

@app.put("/ollama/keep-alive", tags=["Configuración"])
async def set_ollama_keep_alive(request: OllamaKeepAliveRequest):
    """
    Actualizar el tiempo de keep_alive de Ollama
    
    - **seconds**: Tiempo en segundos (0-3600)
        - 0: Descargar el modelo inmediatamente despues de cada uso
        - 1-3600: Mantener el modelo en memoria durante este tiempo
    
    Valores recomendados:
    - 0s: Para liberar memoria inmediatamente (uso ocasional)
    - 30s-60s: Para uso regular con pausas cortas
    - 300s (5min): Para sesiones de trabajo activas
    - 1800s (30min): Para uso prolongado sin pausas
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        success = alfred_core.set_ollama_keep_alive(request.seconds)
        
        if not success:
            raise HTTPException(status_code=400, detail="No se pudo actualizar el keep_alive")
        
        return {
            "status": "success",
            "message": f"keep_alive actualizado a {request.seconds} segundos",
            "keep_alive_seconds": request.seconds
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar keep_alive: {str(e)}")

# --- Endpoints de Conversaciones ---

@app.post("/conversations", response_model=ConversationDetail, tags=["Conversaciones"])
async def create_conversation(request: CreateConversationRequest):
    """
    Crear una nueva conversacion
    
    - **title**: Titulo opcional de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        conversation = conv_mgr.create_conversation(title=request.title)
        
        return ConversationDetail(
            id=conversation["id"],
            title=conversation["title"],
            created_at=conversation["created_at"],
            updated_at=conversation["updated_at"],
            messages=[]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear conversacion: {str(e)}")

@app.get("/conversations", response_model=List[ConversationSummary], tags=["Conversaciones"])
async def list_conversations(limit: Optional[int] = None, offset: int = 0):
    """
    Listar todas las conversaciones
    
    - **limit**: Numero maximo de conversaciones a retornar
    - **offset**: Numero de conversaciones a saltar
    """
    try:
        conv_mgr = get_conversation_manager()
        conversations = conv_mgr.list_conversations(limit=limit, offset=offset)
        
        return [
            ConversationSummary(
                id=conv["id"],
                title=conv["title"],
                created_at=conv["created_at"],
                updated_at=conv["updated_at"],
                message_count=conv["message_count"]
            )
            for conv in conversations
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar conversaciones: {str(e)}")

@app.get("/conversations/{conversation_id}", response_model=ConversationDetail, tags=["Conversaciones"])
async def get_conversation(conversation_id: str):
    """
    Obtener una conversacion por su ID
    
    - **conversation_id**: ID de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        conversation = conv_mgr.get_conversation(conversation_id)
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return ConversationDetail(
            id=conversation["id"],
            title=conversation["title"],
            created_at=conversation["created_at"],
            updated_at=conversation["updated_at"],
            messages=[
                ConversationMessage(**msg)
                for msg in conversation["messages"]
            ]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener conversacion: {str(e)}")

@app.post("/conversations/{conversation_id}/messages", tags=["Conversaciones"])
async def add_message_to_conversation(conversation_id: str, request: AddMessageRequest):
    """
    Agregar un mensaje a una conversacion
    
    - **conversation_id**: ID de la conversacion
    - **role**: Rol del mensaje ('user' o 'assistant')
    - **content**: Contenido del mensaje
    - **metadata**: Metadata adicional (opcional)
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.add_message(
            conversation_id=conversation_id,
            role=request.role,
            content=request.content,
            metadata=request.metadata
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Mensaje agregado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al agregar mensaje: {str(e)}")

@app.delete("/conversations/{conversation_id}", tags=["Conversaciones"])
async def delete_conversation(conversation_id: str):
    """
    Eliminar una conversacion
    
    - **conversation_id**: ID de la conversacion a eliminar
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.delete_conversation(conversation_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Conversacion eliminada exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar conversacion: {str(e)}")

@app.put("/conversations/{conversation_id}/title", tags=["Conversaciones"])
async def update_conversation_title(conversation_id: str, request: UpdateTitleRequest):
    """
    Actualizar el titulo de una conversacion
    
    - **conversation_id**: ID de la conversacion
    - **title**: Nuevo titulo
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.update_conversation_title(conversation_id, request.title)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Titulo actualizado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar titulo: {str(e)}")

@app.delete("/conversations/{conversation_id}/messages", tags=["Conversaciones"])
async def clear_conversation(conversation_id: str):
    """
    Limpiar todos los mensajes de una conversacion
    
    - **conversation_id**: ID de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.clear_conversation(conversation_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Conversacion limpiada exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al limpiar conversacion: {str(e)}")

@app.get("/conversations/search/{query}", response_model=List[ConversationSummary], tags=["Conversaciones"])
async def search_conversations(query: str):
    """
    Buscar conversaciones por titulo o contenido
    
    - **query**: Termino de busqueda
    """
    try:
        conv_mgr = get_conversation_manager()
        results = conv_mgr.search_conversations(query)
        
        return [
            ConversationSummary(
                id=conv["id"],
                title=conv["title"],
                created_at=conv["created_at"],
                updated_at=conv["updated_at"],
                message_count=conv["message_count"]
            )
            for conv in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar conversaciones: {str(e)}")

@app.post("/query/conversation", response_model=QueryResponse, tags=["Consultas"])
async def query_with_conversation(request: QueryWithConversationRequest):
    """
    Realizar una consulta a Alfred con contexto de conversacion
    
    **NOTA DE SEGURIDAD**: Los datos personales en metadata se cifran automaticamente al guardar
    en la conversacion y se descifran al leerlos.
    
    - **question**: Pregunta del usuario
    - **conversation_id**: ID de la conversacion activa (opcional)
    - **use_history**: Buscar primero en el historial Q&A
    - **save_response**: Guardar respuesta en historial Q&A (con cifrado)
    - **search_documents**: Buscar en documentos o solo usar el prompt
    - **max_context_messages**: Numero maximo de mensajes de contexto
    """
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        print(f"Procesando consulta con conversacion: {request.question[:50]}...")
        
        # Obtener historial de conversacion si existe (descifra automaticamente)
        conversation_history = None
        if request.conversation_id:
            conv_mgr = get_conversation_manager()
            messages = conv_mgr.get_conversation_history(
                request.conversation_id,
                max_messages=request.max_context_messages,
                decrypt_messages=True  # Cambiado de decrypt_sensitive a decrypt_messages
            )
            conversation_history = [
                {"role": msg["role"], "content": msg["content"]}
                for msg in messages
            ]
        
        # Ejecutar consulta con contexto de conversacion
        result = alfred_core.query(
            question=request.question,
            use_history=request.use_history,
            search_documents=request.search_documents,
            search_kwargs=request.search_kwargs,
            conversation_history=conversation_history
        )
        
        print(f"Consulta procesada exitosamente")
        
        # Asegurar que los datos personales esten descifrados
        personal_data = ensure_personal_data_decrypted(result.get('personal_data'))
        
        # Registrar acceso a datos personales si existen
        if personal_data:
            log_personal_data_access(
                operation="read",
                data_keys=list(personal_data.keys()),
                user_context=f"Query con conversacion: {request.conversation_id}"
            )
        
        # Agregar mensajes a la conversacion si existe
        if request.conversation_id:
            conv_mgr = get_conversation_manager()
            # Agregar pregunta del usuario
            conv_mgr.add_message(
                conversation_id=request.conversation_id,
                role="user",
                content=request.question,
                metadata={},
                encrypt_sensitive=False  # No hay datos sensibles en pregunta
            )
            # Agregar respuesta del asistente (cifra automaticamente metadata)
            conv_mgr.add_message(
                conversation_id=request.conversation_id,
                role="assistant",
                content=result['answer'],
                metadata={
                    "sources": result.get('sources', []),
                    "personal_data": personal_data,
                    "from_history": result.get('from_history', False)
                },
                encrypt_sensitive=True  # Cifrar datos sensibles en metadata
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context=f"Guardado en conversacion: {request.conversation_id}"
                )
        
        # Guardar en historial Q&A si se solicita (cifra automaticamente)
        if request.save_response and not result.get('from_history', False):
            functionsToHistory.save_qa_to_history(
                question=request.question,
                answer=result['answer'],
                personal_data=personal_data,
                sources=result.get('sources', []),
                encrypt_sensitive=True
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context="Guardado en historial Q&A desde conversacion"
                )
        
        return QueryResponse(
            answer=result['answer'],
            personal_data=personal_data,
            sources=result.get('sources', []),
            from_history=result.get('from_history', False),
            history_score=result.get('history_score'),
            context_count=result.get('context_count', 0)
        )
    
    except Exception as e:
        # Sanitizar el mensaje de error
        error_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        if not error_msg:
            error_msg = "Error desconocido al procesar la consulta"
        
        print(f"Error al procesar consulta: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error al procesar consulta: {error_msg}")

# --- Manejo de errores global ---
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Manejador global de excepciones"""
    return {
        "error": "Internal Server Error",
        "detail": str(exc),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    
    # Obtener configuración desde variables de entorno
    host = os.getenv("ALFRED_HOST", "127.0.0.1")
    port = int(os.getenv("ALFRED_PORT", "8000"))
    reload = os.getenv("ALFRED_RELOAD", "false").lower() == "true"
    
    print(f"""
    ============================================================
              Alfred Backend API Server
    ============================================================
      URL:    http://{host}:{port}
      Docs:   http://{host}:{port}/docs
      Health: http://{host}:{port}/health
    ============================================================
    """)
    
    uvicorn.run(
        "alfred_backend:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )
