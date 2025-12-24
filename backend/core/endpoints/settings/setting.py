# ====================================
# ENDPOINTS DE MODO Y TEMA DE APLICACION
# ====================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from utils.logger import get_logger

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("settings")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class ModeRequest(BaseModel):
    """Solicitud para cambiar el modo de la aplicacion"""
    mode: str = Field(..., description="Modo: work, focus, personal, creative")
    
    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v):
        valid_modes = ['work', 'focus', 'personal', 'creative']
        if v not in valid_modes:
            raise ValueError(f"Modo invalido. Debe ser uno de: {', '.join(valid_modes)}")
        return v

class ModeResponse(BaseModel):
    """Respuesta con el modo actual"""
    mode: str = Field(..., description="Modo actual")
    updated_at: Optional[str] = Field(None, description="Timestamp de actualizacion")

class ThemeRequest(BaseModel):
    """Solicitud para cambiar el tema de la aplicacion"""
    theme: str = Field(..., description="Tema: light o dark")
    
    @field_validator('theme')
    @classmethod
    def validate_theme(cls, v):
        valid_themes = ['light', 'dark']
        if v not in valid_themes:
            raise ValueError(f"Tema invalido. Debe ser uno de: {', '.join(valid_themes)}")
        return v

class ThemeResponse(BaseModel):
    """Respuesta con el tema actual"""
    theme: str = Field(..., description="Tema actual")
    updated_at: Optional[str] = Field(None, description="Timestamp de actualizacion")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/settings/mode", response_model=ModeResponse, tags=["Configuración"])
async def set_mode(request: ModeRequest):
    """
    Guardar el modo actual de la aplicacion
    
    Modos disponibles:
    - work: Modo trabajo (cyan)
    - focus: Modo concentracion (morado)
    - personal: Modo personal (rosa)
    - creative: Modo creativo (naranja)
    
    El modo se guarda en la base de datos y se carga automaticamente
    al iniciar la aplicacion.
    """
    from db_manager import set_user_setting
    
    try:
        # Guardar en base de datos
        success = set_user_setting('app_mode', request.mode, 'string')
        
        if not success:
            raise Exception("No se pudo guardar el modo en la base de datos")
        
        backend_logger.info(f"Modo cambiado a: {request.mode}")
        
        return ModeResponse(
            mode=request.mode,
            updated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        error_detail = f"Error al guardar modo: {str(e)}"
        backend_logger.error(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)

@router.get("/settings/mode", response_model=ModeResponse, tags=["Configuración"])
async def get_mode():
    """
    Obtener el modo actual de la aplicacion
    
    Retorna el modo guardado en la base de datos.
    Si no hay modo guardado, retorna 'work' como valor por defecto.
    """
    from db_manager import get_user_setting
    
    try:
        # Obtener de base de datos (retorna directamente el valor string)
        mode = get_user_setting('app_mode', default='work')
        
        return ModeResponse(
            mode=mode,
            updated_at=None  # Opcional: podriamos consultar updated_at si es necesario
        )
        
    except Exception as e:
        error_detail = f"Error al obtener modo: {str(e)}"
        backend_logger.error(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)

@router.post("/settings/theme", response_model=ThemeResponse, tags=["Configuración"])
async def set_theme(request: ThemeRequest):
    """
    Guardar el tema actual de la aplicacion
    
    Temas disponibles:
    - light: Tema claro
    - dark: Tema oscuro
    
    El tema se guarda en la base de datos y se carga automaticamente
    al iniciar la aplicacion.
    """
    from db_manager import set_user_setting
    
    try:
        # Guardar en base de datos
        success = set_user_setting('app_theme', request.theme, 'string')
        
        if not success:
            raise Exception("No se pudo guardar el tema en la base de datos")
        
        backend_logger.info(f"Tema cambiado a: {request.theme}")
        
        return ThemeResponse(
            theme=request.theme,
            updated_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        error_detail = f"Error al guardar tema: {str(e)}"
        backend_logger.error(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)

@router.get("/settings/theme", response_model=ThemeResponse, tags=["Configuración"])
async def get_theme():
    """
    Obtener el tema actual de la aplicacion
    
    Retorna el tema guardado en la base de datos.
    Si no hay tema guardado, retorna 'dark' como valor por defecto.
    """
    from db_manager import get_user_setting
    
    try:
        # Obtener de base de datos (retorna directamente el valor string)
        theme = get_user_setting('app_theme', default='dark')
        
        return ThemeResponse(
            theme=theme,
            updated_at=None  # Opcional: podriamos consultar updated_at si es necesario
        )
        
    except Exception as e:
        error_detail = f"Error al obtener tema: {str(e)}"
        backend_logger.error(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)
