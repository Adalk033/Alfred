# ============================================================================
# ENDPOINTS DE OPTIMIZACIONES Y ESTADISTICAS RAG
# ============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict
from utils.logger import get_logger
from endpoints.shared_state import get_alfred_core_instance

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("optimizations")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class OptimizationStats(BaseModel):
    """Estadisticas de optimizaciones RAG"""
    embedding_model: str = Field(..., description="Modelo de embeddings en uso")
    embedding_dimension: int = Field(..., description="Dimension de los vectores")
    vram_available: float = Field(..., description="VRAM disponible en GB")
    cache_enabled: bool = Field(..., description="Si el cache LRU esta activo")
    cache_hits: int = Field(0, description="Numero de hits del cache")
    cache_misses: int = Field(0, description="Numero de misses del cache")
    cache_hit_rate: float = Field(0.0, description="Tasa de acierto del cache")
    cache_size: int = Field(0, description="Entradas actuales en cache")
    total_documents_indexed: int = Field(0, description="Documentos en vector store")
    chunking_strategies: Dict[str, int] = Field(default_factory=dict, description="Estrategias de chunking aplicadas")
    optimized_storage: bool = Field(False, description="Si usa DuckDB+Parquet")
    storage_path: str = Field(..., description="Ruta del almacenamiento ChromaDB")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/optimizations/stats", response_model=OptimizationStats, tags=["Optimizaciones"])
async def get_optimization_stats():
    """
    Obtener estadisticas de optimizaciones RAG
    
    Retorna informacion sobre:
    - Modelo de embeddings seleccionado automaticamente
    - Estadisticas de cache LRU (hits, misses, hit rate)
    - Estrategias de chunking aplicadas
    - Almacenamiento optimizado DuckDB+Parquet
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        # Obtener info del embedding manager
        embedding_manager = alfred_core._embedding_manager
        embedding_model = embedding_manager.select_best_model()
        vram_gb = embedding_manager.get_available_vram()
        
        # Dimension segun modelo
        model_dims = {
            "nomic-embed-text:v1.5": 768,
            "bge-large-en-v1.5": 1024,
            "gte-small": 384,
            "all-minilm:l6-v2": 384
        }
        embedding_dim = model_dims.get(embedding_model, 768)
        
        # Estadisticas de cache
        cache_stats = {"hits": 0, "misses": 0, "hit_rate": 0.0, "size": 0}
        if hasattr(alfred_core, '_retrieval_cache') and alfred_core._retrieval_cache:
            cache_stats = alfred_core._retrieval_cache.get_stats()
        
        # Info del vector manager
        vector_manager = alfred_core.vector_manager
        total_docs = 0
        if vector_manager and vector_manager._vectorstore:
            try:
                total_docs = vector_manager._vectorstore._collection.count()
            except:
                total_docs = 0
        
        # Estrategias de chunking
        chunking_strategies = {
            "text": 0,
            "code": 0, 
            "document": 0
        }
        
        return OptimizationStats(
            embedding_model=embedding_model,
            embedding_dimension=embedding_dim,
            vram_available=vram_gb,
            cache_enabled=cache_stats.get("size", 0) >= 0,
            cache_hits=cache_stats.get("hits", 0),
            cache_misses=cache_stats.get("misses", 0),
            cache_hit_rate=cache_stats.get("hit_rate", 0.0),
            cache_size=cache_stats.get("size", 0),
            total_documents_indexed=total_docs,
            chunking_strategies=chunking_strategies,
            optimized_storage=vector_manager.use_optimized_storage if vector_manager else False,
            storage_path=vector_manager.chroma_db_path if vector_manager else ""
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estadisticas de optimizaciones: {str(e)}")
