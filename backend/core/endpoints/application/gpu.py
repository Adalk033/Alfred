# ====================================
# ENDPOINTS DE ESTADO DE GPU
# ====================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from utils.logger import get_logger
from endpoints.shared_state import get_alfred_core_instance

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("gpu")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class GPUStatus(BaseModel):
    """Estado de la GPU"""
    gpu_available: bool
    device_type: str
    device: str
    gpu_info: Dict[str, Any] = Field(default_factory=dict)
    memory_usage: Optional[Dict[str, float]] = None

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/gpu/status", response_model=GPUStatus, tags=["Sistema"])
async def get_gpu_status():
    """
    Obtener el estado actual de la GPU
    
    Retorna información detallada sobre:
    - Si hay GPU disponible
    - Tipo de GPU (NVIDIA, AMD, Apple Silicon)
    - Uso de memoria (si esta disponible)
    - Informacion del dispositivo
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
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

@router.get("/gpu/report", tags=["Sistema"])
async def get_gpu_report():
    """
    Obtener un reporte detallado del estado de la GPU en formato de texto
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core:
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        gpu_mgr = alfred_core.gpu_manager
        report = gpu_mgr.get_status_report()
        return {
            "report": report,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar reporte: {str(e)}")
