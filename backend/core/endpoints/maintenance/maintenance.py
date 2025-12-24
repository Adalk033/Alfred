# ============================================================================
# ENDPOINTS DE MANTENIMIENTO Y DESARROLLO
# ============================================================================

from fastapi import APIRouter, HTTPException, BackgroundTasks
from utils.logger import get_logger
from endpoints.shared_state import get_alfred_core_instance

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("maintenance")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/reload", tags=["Mantenimiento"])
async def reload_documents(background_tasks: BackgroundTasks):
    """
    Recargar documentos desde el directorio configurado
    (Operacion pesada, se ejecuta en background)
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        background_tasks.add_task(alfred_core.reload_documents)
        return {
            "status": "started",
            "message": "Recarga de documentos iniciada en segundo plano"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al recargar documentos: {str(e)}")

@router.get("/documents/test", tags=["Desarrollo"])
async def test_search(query: str, k: int = 5):
    """
    Realizar una busqueda directa en la base de datos vectorial (para testing)
    
    - **query**: Consulta de busqueda
    - **k**: Numero de resultados a devolver
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
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
        raise HTTPException(status_code=500, detail=f"Error al realizar busqueda: {str(e)}")
