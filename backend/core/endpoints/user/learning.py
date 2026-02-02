"""
Learning Endpoints - Endpoints para el sistema de aprendizaje personalizado
Permite iniciar aprendizaje manual, ver estado y resetear patrones aprendidos
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

from user_learning_manager import get_learning_manager
from db_manager import get_user_setting, set_user_setting, delete_user_setting
from utils.logger import get_logger

router = APIRouter()
learning_logger = get_logger("learning_endpoint")


class LearningRequest(BaseModel):
    """Solicitud para iniciar aprendizaje"""
    mode: str = Field(
        default='light',
        description="Modo de aprendizaje: 'light' (rapido) o 'heavy' (profundo)"
    )


class LearningStatusResponse(BaseModel):
    """Estado del sistema de aprendizaje"""
    is_training: bool
    current_mode: Optional[str] = None
    progress: int = 0
    status_message: str = ""
    last_learning_date: Optional[str] = None
    last_mode_used: Optional[str] = None
    patterns_summary: Optional[Dict[str, Any]] = None


class LearningSettingsRequest(BaseModel):
    """Configuracion del aprendizaje automatico"""
    auto_learning_enabled: bool = True
    default_mode: str = 'light'
    learning_interval_days: int = 7
    min_conversations_trigger: int = 50


class LearningSettingsResponse(BaseModel):
    """Respuesta con configuracion actual"""
    auto_learning_enabled: bool
    default_mode: str
    learning_interval_days: int
    min_conversations_trigger: int


@router.post("/learning/start", tags=["Aprendizaje"])
async def start_learning(request: LearningRequest):
    """
    Iniciar proceso de aprendizaje de patrones del usuario
    
    Modos disponibles:
    - **light**: Extrae patrones estadisticos basicos (rapido, no usa GPU)
    - **heavy**: Analisis profundo con mas metricas (mas lento, mas preciso)
    
    El aprendizaje se ejecuta en background y actualiza el perfil del usuario.
    """
    try:
        learning_manager = get_learning_manager()
        
        if learning_manager.is_training:
            return {
                "success": False,
                "message": "Ya hay un aprendizaje en curso",
                "status": learning_manager.get_status()
            }
        
        # Validar modo
        if request.mode not in ['light', 'heavy']:
            raise HTTPException(
                status_code=400,
                detail="Modo invalido. Use 'light' o 'heavy'"
            )
        
        learning_logger.info(f"Iniciando aprendizaje manual (modo: {request.mode})")
        
        # Ejecutar aprendizaje
        result = await learning_manager.learn_from_conversations(mode=request.mode)
        
        return {
            "success": result.get('success', False),
            "message": result.get('message', ''),
            "patterns": result.get('patterns', {}),
            "mode_used": request.mode
        }
        
    except HTTPException:
        raise
    except Exception as e:
        learning_logger.error(f"Error al iniciar aprendizaje: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/learning/status", response_model=LearningStatusResponse, tags=["Aprendizaje"])
async def get_learning_status():
    """
    Obtener estado actual del sistema de aprendizaje
    
    Retorna:
    - Estado del proceso de aprendizaje
    - Fecha del ultimo aprendizaje
    - Resumen de patrones aprendidos
    """
    try:
        learning_manager = get_learning_manager()
        status = learning_manager.get_status()
        
        # Obtener info de BD
        last_date = get_user_setting('last_learning_date', default=None)
        last_mode = get_user_setting('learning_mode_used', default=None)
        patterns = learning_manager.get_learned_patterns()
        
        # Crear resumen de patrones
        patterns_summary = None
        if patterns:
            patterns_summary = {
                'topics_count': len(patterns.get('common_topics', [])),
                'top_topics': patterns.get('common_topics', [])[:5],
                'detail_preference': patterns.get('detail_preference'),
                'tone_preference': patterns.get('tone_preference'),
                'vocabulary_level': patterns.get('vocabulary_level'),
                'conversations_analyzed': patterns.get('conversations_analyzed', 0),
                'learned_at': patterns.get('learned_at')
            }
        
        return LearningStatusResponse(
            is_training=status['is_training'],
            current_mode=status['current_mode'],
            progress=status['progress'],
            status_message=status['status_message'],
            last_learning_date=last_date,
            last_mode_used=last_mode,
            patterns_summary=patterns_summary
        )
        
    except Exception as e:
        learning_logger.error(f"Error obteniendo estado: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/learning/patterns", tags=["Aprendizaje"])
async def get_learned_patterns():
    """
    Obtener todos los patrones aprendidos del usuario
    
    Retorna el perfil completo aprendido incluyendo:
    - Temas de interes
    - Preferencias de comunicacion
    - Patrones de uso
    """
    try:
        learning_manager = get_learning_manager()
        patterns = learning_manager.get_learned_patterns()
        
        if not patterns:
            return {
                "success": True,
                "has_patterns": False,
                "message": "No hay patrones aprendidos aun",
                "patterns": {}
            }
        
        return {
            "success": True,
            "has_patterns": True,
            "patterns": patterns
        }
        
    except Exception as e:
        learning_logger.error(f"Error obteniendo patrones: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/learning/reset", tags=["Aprendizaje"])
async def reset_learning():
    """
    Resetear todo el aprendizaje del usuario
    
    Elimina todos los patrones aprendidos. El sistema volvera
    a comportarse como si nunca hubiera aprendido del usuario.
    """
    try:
        learning_manager = get_learning_manager()
        
        if learning_manager.is_training:
            raise HTTPException(
                status_code=409,
                detail="No se puede resetear mientras hay un aprendizaje en curso"
            )
        
        # Eliminar settings de aprendizaje
        delete_user_setting('learned_user_patterns')
        delete_user_setting('last_learning_date')
        delete_user_setting('learning_mode_used')
        
        learning_logger.info("Aprendizaje reseteado por el usuario")
        
        return {
            "success": True,
            "message": "Aprendizaje reseteado exitosamente. El asistente ya no usara patrones aprendidos."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        learning_logger.error(f"Error reseteando aprendizaje: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/learning/settings", response_model=LearningSettingsResponse, tags=["Aprendizaje"])
async def get_learning_settings():
    """
    Obtener configuracion actual del aprendizaje automatico
    """
    try:
        return LearningSettingsResponse(
            auto_learning_enabled=get_user_setting('auto_learning_enabled', default=True, setting_type='bool'),
            default_mode=get_user_setting('learning_default_mode', default='light'),
            learning_interval_days=get_user_setting('learning_interval_days', default=7, setting_type='int'),
            min_conversations_trigger=get_user_setting('learning_min_conversations', default=50, setting_type='int')
        )
        
    except Exception as e:
        learning_logger.error(f"Error obteniendo configuracion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning/settings", response_model=LearningSettingsResponse, tags=["Aprendizaje"])
async def update_learning_settings(request: LearningSettingsRequest):
    """
    Actualizar configuracion del aprendizaje automatico
    
    - **auto_learning_enabled**: Habilitar/deshabilitar aprendizaje automatico
    - **default_mode**: Modo por defecto ('light' o 'heavy')
    - **learning_interval_days**: Dias entre aprendizajes automaticos
    - **min_conversations_trigger**: Minimo de conversaciones para disparar aprendizaje
    """
    try:
        # Validar modo
        if request.default_mode not in ['light', 'heavy']:
            raise HTTPException(
                status_code=400,
                detail="Modo invalido. Use 'light' o 'heavy'"
            )
        
        # Guardar configuracion
        set_user_setting('auto_learning_enabled', str(request.auto_learning_enabled).lower(), 'bool')
        set_user_setting('learning_default_mode', request.default_mode, 'string')
        set_user_setting('learning_interval_days', str(request.learning_interval_days), 'int')
        set_user_setting('learning_min_conversations', str(request.min_conversations_trigger), 'int')
        
        learning_logger.info(f"Configuracion de aprendizaje actualizada: modo={request.default_mode}, auto={request.auto_learning_enabled}")
        
        return LearningSettingsResponse(
            auto_learning_enabled=request.auto_learning_enabled,
            default_mode=request.default_mode,
            learning_interval_days=request.learning_interval_days,
            min_conversations_trigger=request.min_conversations_trigger
        )
        
    except HTTPException:
        raise
    except Exception as e:
        learning_logger.error(f"Error actualizando configuracion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning/check-auto", tags=["Aprendizaje"])
async def check_auto_learning():
    """
    Verificar y ejecutar aprendizaje automatico si corresponde
    
    Este endpoint es llamado periodicamente por el sistema para
    verificar si es momento de aprender automaticamente.
    """
    try:
        # Verificar si auto-learning esta habilitado
        auto_enabled = get_user_setting('auto_learning_enabled', default=True, setting_type='bool')
        
        if not auto_enabled:
            return {
                "success": True,
                "action": "skipped",
                "reason": "Aprendizaje automatico deshabilitado"
            }
        
        learning_manager = get_learning_manager()
        
        if learning_manager.is_training:
            return {
                "success": True,
                "action": "skipped",
                "reason": "Ya hay un aprendizaje en curso"
            }
        
        should_learn = await learning_manager.should_learn()
        
        if not should_learn:
            return {
                "success": True,
                "action": "skipped",
                "reason": "No es momento de aprender aun"
            }
        
        # Obtener modo por defecto
        default_mode = get_user_setting('learning_default_mode', default='light')
        
        learning_logger.info(f"Iniciando aprendizaje automatico (modo: {default_mode})")
        
        # Ejecutar aprendizaje
        result = await learning_manager.learn_from_conversations(mode=default_mode)
        
        return {
            "success": result.get('success', False),
            "action": "learned",
            "message": result.get('message', ''),
            "patterns": result.get('patterns', {})
        }
        
    except Exception as e:
        learning_logger.error(f"Error en aprendizaje automatico: {e}")
        return {
            "success": False,
            "action": "error",
            "reason": str(e)
        }
