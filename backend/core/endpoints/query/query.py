# ============================================================================
# ENDPOINT DE CONSULTAS A ALFRED
# ============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any
from utils.logger import get_logger
from utils.security import decrypt_data, encrypt_for_transport, is_encryption_enabled
from endpoints.shared_state import get_alfred_core_instance
import functionsToHistory

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("query")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class QueryRequest(BaseModel):
    """Solicitud de consulta al asistente con validacion mejorada"""
    question: str = Field(
        ..., 
        description="Pregunta del usuario", 
        min_length=1,
        max_length=2000
    )
    use_history: bool = Field(True, description="Buscar primero en el historial")
    save_response: bool = Field(False, description="Guardar respuesta automaticamente")
    search_documents: bool = Field(True, description="Buscar en documentos o solo usar el prompt")
    search_kwargs: Optional[Dict[str, Any]] = Field(
        None, 
        description="Parametros adicionales de busqueda (k, fetch_k, search_type)"
    )
    
    @field_validator('question')
    @classmethod
    def validate_question(cls, v):
        if not v or not v.strip():
            raise ValueError('La pregunta no puede estar vacia')
        return v
    
    @field_validator('search_kwargs')
    @classmethod
    def validate_search_kwargs(cls, v):
        if v is not None:
            allowed_keys = {'k', 'fetch_k', 'search_type'}
            invalid_keys = set(v.keys()) - allowed_keys
            if invalid_keys:
                raise ValueError(f'Parametros no permitidos: {invalid_keys}')
        return v

class QueryResponse(BaseModel):
    """Respuesta del asistente"""
    answer: str = Field(..., description="Respuesta generada por Alfred")
    personal_data: Optional[Dict[str, str]] = Field(None, description="Datos personales extraidos")
    sources: list = Field(default_factory=list, description="Fuentes de los documentos")
    from_history: bool = Field(False, description="Si la respuesta proviene del historial")
    history_score: Optional[float] = Field(None, description="Score de similitud con historial")
    timestamp: str = Field(default_factory=lambda: __import__('datetime').datetime.now().isoformat())
    context_count: int = Field(0, description="Numero de fragmentos recuperados")
    from_cache: Optional[bool] = Field(None, description="Si la respuesta proviene del cache en memoria")
    cache_age_seconds: Optional[float] = Field(None, description="Edad del cache en segundos")
    
    class Config:
        json_schema_extra = {
            "example": {
                "answer": "La respuesta a tu pregunta...",
                "sources": ["documento1.pdf", "documento2.txt"]
            }
        }

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def ensure_personal_data_decrypted(data: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """Asegura que los datos personales esten descifrados"""
    if not data:
        return None
    
    try:
        from functionsToHistory import decrypt_personal_data
        decrypted = {}
        for key, value in data.items():
            if isinstance(value, str) and value.startswith('gAAAAAB'):
                try:
                    decrypted[key] = decrypt_data(value)
                    backend_logger.debug(f"Dato personal descifrado: {key}")
                except Exception as e:
                    backend_logger.warning(f"No se pudo descifrar {key}: {e}")
                    decrypted[key] = value
            else:
                decrypted[key] = value
        return decrypted
    except Exception as e:
        backend_logger.error(f"Error al descifrar datos personales: {e}")
        return data

def log_personal_data_access(operation: str, data_keys: list, user_context: str = "API"):
    """Registra el acceso a datos personales para auditoria"""
    from datetime import datetime
    backend_logger.info(
        f"Acceso a datos personales: {operation} | "
        f"Campos: {', '.join(data_keys)} | "
        f"Contexto: {user_context} | "
        f"Timestamp: {datetime.now().isoformat()}"
    )

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/query", response_model=QueryResponse, tags=["Consultas"])
async def query_alfred(request: QueryRequest):
    """
    Realizar una consulta a Alfred
    
    **NOTA DE SEGURIDAD**: Los datos personales se cifran automaticamente antes de almacenarlos
    y se descifran antes de enviarlos al cliente.
    
    **CIFRADO END-TO-END**: Las preguntas pueden venir cifradas desde el frontend y se descifran
    aqui antes de procesarlas.
    
    - **question**: Pregunta del usuario (puede estar cifrada con Fernet)
    - **use_history**: Buscar primero en el historial de respuestas
    - **save_response**: Guardar automaticamente la respuesta en el historial (con cifrado)
    - **search_documents**: Buscar en documentos o solo usar el prompt
    - **search_kwargs**: Parametros adicionales para la busqueda (k, fetch_k, etc.)
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        # DESCIFRAR PREGUNTA SI VIENE CIFRADA (End-to-End Encryption)
        question = request.question
        was_encrypted = False
        
        if question and question.startswith('gAAAAAB'):
            backend_logger.info(f"Pregunta cifrada detectada, descifrando...")
            try:
                question = decrypt_data(question)
                was_encrypted = True
                backend_logger.info(f"Pregunta descifrada correctamente: {question[:50]}...")
            except Exception as decrypt_error:
                backend_logger.error(f"Error al descifrar pregunta: {decrypt_error}")
                raise HTTPException(
                    status_code=400, 
                    detail="Error al descifrar la pregunta. Verifica que el cifrado este configurado correctamente."
                )
        
        backend_logger.info(f"Procesando consulta {'(descifrada)' if was_encrypted else ''}: {question[:50]}...")
        
        # Ejecutar consulta con version async optimizada
        result = await alfred_core.query_async(
            question=question,
            use_history=request.use_history,
            search_documents=request.search_documents,
            search_kwargs=request.search_kwargs
        )
        
        backend_logger.info("Consulta procesada exitosamente")
        
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
                encrypt_sensitive=True
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context="Guardado en historial"
                )
        
        # Crear respuesta
        response_data = QueryResponse(
            answer=result['answer'],
            personal_data=personal_data,
            sources=result.get('sources', []),
            from_history=result.get('from_history', False),
            history_score=result.get('history_score'),
            context_count=result.get('context_count', 0)
        )
        
        # CIFRAR DATOS SENSIBLES PARA VIAJE POR LA RED
        if is_encryption_enabled():
            response_dict = response_data.dict()
            response_dict = encrypt_for_transport(response_dict)
            response_data = QueryResponse(**response_dict)
        
        return response_data
    
    except Exception as e:
        error_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        if not error_msg:
            error_msg = "Error desconocido al procesar la consulta"
        
        backend_logger.error(f"Error al procesar consulta: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error al procesar consulta: {error_msg}")
