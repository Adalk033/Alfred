# ============================================================================
# ENDPOINTS DE HISTORIAL DE CONSULTAS
# ============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from utils.logger import get_logger
import functionsToHistory

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("history")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class HistorySearchRequest(BaseModel):
    """Solicitud de busqueda en historial"""
    search_term: str = Field(..., description="Termino a buscar", min_length=1)
    threshold: float = Field(0.2, description="Umbral de similitud", ge=0.0, le=1.0)
    top_k: int = Field(10, description="Numero maximo de resultados", ge=1, le=50)

class HistoryEntry(BaseModel):
    """Entrada del historial"""
    timestamp: str
    question: str
    answer: str
    personal_data: Optional[Dict[str, str]] = None
    sources: List[str] = Field(default_factory=list)
    similarity_score: Optional[float] = None

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def ensure_personal_data_decrypted(data: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """Asegura que los datos personales esten descifrados"""
    if not data:
        return None
    
    try:
        from utils.security import decrypt_data
        decrypted = {}
        for key, value in data.items():
            if isinstance(value, str) and value.startswith('gAAAAAB'):
                try:
                    decrypted[key] = decrypt_data(value)
                except Exception as e:
                    backend_logger.warning(f"No se pudo descifrar {key}: {e}")
                    decrypted[key] = value
            else:
                decrypted[key] = value
        return decrypted
    except Exception as e:
        backend_logger.error(f"Error al descifrar datos personales: {e}")
        return data

def log_personal_data_access(operation: str, data_keys: List[str], user_context: str = "API"):
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

@router.post("/history/search", response_model=List[HistoryEntry], tags=["Historial"])
async def search_history(request: HistorySearchRequest):
    """
    Buscar en el historial de preguntas y respuestas
    
    **NOTA DE SEGURIDAD**: Los datos personales se descifran automaticamente antes de ser enviados.
    
    - **search_term**: Termino a buscar
    - **threshold**: Umbral de similitud (0.0 - 1.0)
    - **top_k**: Numero maximo de resultados
    """
    try:
        results = functionsToHistory.search_in_qa_history(
            question=request.search_term,
            threshold=request.threshold,
            top_k=request.top_k
        )
        
        history_entries = []
        for score, entry in results:
            personal_data = ensure_personal_data_decrypted(entry.get('personal_data'))
            
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

@router.get("/history", response_model=List[HistoryEntry], tags=["Historial"])
async def get_history(limit: int = 10, offset: int = 0):
    """
    Obtener el historial de preguntas y respuestas
    
    **NOTA DE SEGURIDAD**: Los datos personales se descifran automaticamente antes de ser enviados.
    
    - **limit**: Numero maximo de entradas a devolver
    - **offset**: Numero de entradas a saltar (para paginacion)
    """
    try:
        history = functionsToHistory.load_qa_history(decrypt_sensitive=True)
        
        # Aplicar paginacion
        paginated = history[offset:offset + limit]
        
        history_entries = []
        for entry in reversed(paginated):  # Mas recientes primero
            personal_data = ensure_personal_data_decrypted(entry.get('personal_data'))
            
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

@router.delete("/history/{timestamp}", tags=["Historial"])
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
