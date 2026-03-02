# ============================================================================
# ENDPOINTS DE CONFIGURACION DE USUARIO
# ============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Crear router para este módulo
router = APIRouter()

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class UserSettingRequest(BaseModel):
    """Solicitud para guardar configuracion de usuario"""
    key: str = Field(..., description="Clave de configuracion")
    value: Any = Field(..., description="Valor de configuracion")
    setting_type: str = Field('string', description="Tipo: string, int, float, bool, json")

class UserSettingResponse(BaseModel):
    """Respuesta con configuracion de usuario"""
    key: str
    value: Any
    type: str
    updated_at: Optional[str] = None

class ProfilePictureRequest(BaseModel):
    """Solicitud para guardar foto de perfil"""
    picture_data: str = Field(..., description="Datos de imagen en Base64")

class ProfilePictureHistoryResponse(BaseModel):
    """Respuesta con historial de fotos de perfil"""
    current: Optional[str] = None
    history: List[str] = Field(default_factory=list)
    history_count: int = 0

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/user/settings", tags=["Usuario"])
async def get_user_settings():
    """
    Obtener todas las configuraciones de usuario (CIFRADAS para el frontend)
    
    Returns:
        Diccionario con todas las configuraciones (valores RAW sin descifrar)
    """
    try:
        from db_manager import get_connection, SENSITIVE_USER_SETTINGS
        import json
        
        # Leer directamente de BD sin descifrar
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT setting_key, setting_value, setting_type, updated_at FROM user_settings")
        rows = cursor.fetchall()
        conn.close()
        
        settings = {}
        for row in rows:
            key = row["setting_key"]
            value_str = row["setting_value"]
            setting_type = row["setting_type"]
            
            # Si es campo sensible, enviar como string cifrado sin conversion
            if key in SENSITIVE_USER_SETTINGS:
                value = value_str  # Mantener cifrado
            else:
                # Convertir tipo de dato solo si NO es sensible
                if setting_type == 'json':
                    value = json.loads(value_str) if value_str else None
                elif setting_type == 'int':
                    value = int(value_str) if value_str else None
                elif setting_type == 'float':
                    value = float(value_str) if value_str else None
                elif setting_type == 'bool':
                    value = value_str == '1' or value_str.lower() == 'true'
                else:
                    value = value_str
            
            settings[key] = {
                "value": value,
                "type": setting_type,
                "updated_at": row["updated_at"]
            }
        
        return {
            "success": True,
            "settings": settings,
            "count": len(settings)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener configuraciones: {str(e)}")

@router.get("/user/setting/{key}", response_model=UserSettingResponse, tags=["Usuario"])
async def get_user_setting_endpoint(key: str):
    """
    Obtener una configuracion especifica de usuario (CIFRADA para el frontend)
    
    Args:
        key: Clave de la configuracion (ej: 'profile_picture', 'ollama_keep_alive')
    
    Returns:
        Valor RAW de la BD (cifrado si es campo sensible, texto plano si no lo es)
    """
    try:
        from db_manager import get_connection, SENSITIVE_USER_SETTINGS
        
        # Obtener valor RAW directamente de BD (sin descifrar)
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT setting_value, setting_type, updated_at FROM user_settings WHERE setting_key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"Configuracion '{key}' no encontrada")
        
        import json
        value_str = row["setting_value"]
        setting_type = row["setting_type"]
        
        # NO descifrar - enviar RAW al frontend
        # El frontend se encargara de descifrar campos sensibles
        
        # Si es campo sensible, enviar como string cifrado sin conversion
        if key in SENSITIVE_USER_SETTINGS:
            value = value_str  # Mantener cifrado
        else:
            # Convertir tipo de dato solo si NO es sensible
            if setting_type == 'json':
                value = json.loads(value_str) if value_str else None
            elif setting_type == 'int':
                value = int(value_str) if value_str else None
            elif setting_type == 'float':
                value = float(value_str) if value_str else None
            elif setting_type == 'bool':
                value = value_str == '1' or value_str.lower() == 'true'
            else:
                value = value_str
        
        return {
            "key": key,
            "value": value,
            "type": setting_type,
            "updated_at": row["updated_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener configuracion: {str(e)}")

@router.post("/user/setting", tags=["Usuario"])
async def set_user_setting(request: UserSettingRequest):
    """
    Guardar una configuracion de usuario
    
    Ejemplos:
    - Foto de perfil: key='profile_picture', value=<base64>, type='string'
    - Keep alive: key='ollama_keep_alive', value=300, type='int'
    - Historial de fotos: key='profile_picture_history', value=[], type='json'
    """
    try:
        from db_manager import set_user_setting
        
        success = set_user_setting(request.key, request.value, request.setting_type)
        
        if success:
            return {
                "success": True,
                "message": f"Configuracion '{request.key}' guardada exitosamente",
                "key": request.key
            }
        else:
            raise HTTPException(status_code=500, detail="Error al guardar configuracion")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.delete("/user/setting/{key}", tags=["Usuario"])
async def delete_user_setting(key: str):
    """
    Eliminar una configuracion de usuario
    
    Args:
        key: Clave de la configuracion a eliminar
    """
    try:
        from db_manager import delete_user_setting
        
        success = delete_user_setting(key)
        
        if success:
            return {
                "success": True,
                "message": f"Configuracion '{key}' eliminada exitosamente"
            }
        else:
            raise HTTPException(status_code=404, detail=f"Configuracion '{key}' no encontrada")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/security/encryption-key", tags=["Seguridad"])
async def get_encryption_key():
    """
    Obtener la clave de cifrado para el frontend
    
    IMPORTANTE: Esta clave permite descifrar datos sensibles.
    Solo debe usarse en comunicacion local (127.0.0.1)
    
    Returns:
        Clave de cifrado en formato base64 (Fernet)
    """
    try:
        from utils.security import get_encryption_key_display, encryption_key_exists
        
        if not encryption_key_exists():
            raise HTTPException(status_code=500, detail="Clave de cifrado no inicializada")
        
        key = get_encryption_key_display()
        
        return {
            "success": True,
            "encryption_key": key,
            "algorithm": "AES-256-GCM (Fernet)",
            "warning": "Esta clave es sensible. No la expongas publicamente."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener clave: {str(e)}")

@router.get("/security/sensitive-fields", tags=["Seguridad"])
async def get_sensitive_fields():
    """
    Obtener lista de campos sensibles que requieren descifrado en el frontend
    
    Returns:
        Lista de claves de user_settings que estan cifradas
    """
    try:
        from db_manager import SENSITIVE_USER_SETTINGS
        
        return {
            "success": True,
            "sensitive_fields": list(SENSITIVE_USER_SETTINGS),
            "count": len(SENSITIVE_USER_SETTINGS)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# --- Endpoints especificos para foto de perfil ---

@router.post("/user/profile-picture", tags=["Usuario"])
async def set_profile_picture(request: ProfilePictureRequest):
    """
    Guardar foto de perfil en Base64
    
    Guarda la foto actual y mueve la anterior al historial automaticamente
    """
    try:
        from db_manager import get_user_setting, set_user_setting
        
        # Validar tamaño (max ~5MB cuando se decodifica)
        if len(request.picture_data) > 7000000:  # ~5MB en base64
            raise HTTPException(status_code=400, detail="Imagen demasiado grande (max 5MB)")
        
        # Obtener foto actual
        current_picture = get_user_setting('profile_picture', default=None)
        
        # Obtener historial actual
        history = get_user_setting('profile_picture_history', default=[], setting_type='json')
        
        # Si hay foto actual y no esta en historial, agregarla
        if current_picture and current_picture not in history:
            history.insert(0, current_picture)
            # Limitar historial a 20 fotos
            if len(history) > 20:
                history = history[:20]
            # Guardar historial actualizado
            set_user_setting('profile_picture_history', history, 'json')
        
        # Guardar nueva foto de perfil
        success = set_user_setting('profile_picture', request.picture_data, 'string')
        
        if success:
            return {
                "success": True,
                "message": "Foto de perfil actualizada",
                "history_count": len(history)
            }
        else:
            raise HTTPException(status_code=500, detail="Error al guardar foto")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/user/profile-picture", response_model=ProfilePictureHistoryResponse, tags=["Usuario"])
async def get_profile_picture():
    """
    Obtener foto de perfil actual y su historial (CIFRADA para el frontend)
    El frontend debe descifrar usando CryptoManager
    """
    try:
        from db_manager import get_connection
        import json
        
        # Leer directamente de BD sin descifrar (RAW)
        conn = get_connection()
        cursor = conn.cursor()
        
        # Obtener profile_picture (cifrada)
        cursor.execute("SELECT setting_value FROM user_settings WHERE setting_key = ?", ('profile_picture',))
        pic_row = cursor.fetchone()
        current = pic_row["setting_value"] if pic_row else None
        
        # Obtener profile_picture_history (puede ser JSON)
        cursor.execute("SELECT setting_value, setting_type FROM user_settings WHERE setting_key = ?", ('profile_picture_history',))
        hist_row = cursor.fetchone()
        
        if hist_row and hist_row["setting_value"]:
            # Si es JSON, parsear
            if hist_row["setting_type"] == 'json':
                try:
                    history = json.loads(hist_row["setting_value"])
                except:
                    history = []
            else:
                history = []
        else:
            history = []
        
        conn.close()
        
        return {
            "current": current,  # ← Cifrada (gAAAAA...)
            "history": history,
            "history_count": len(history)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.delete("/user/profile-picture", tags=["Usuario"])
async def delete_profile_picture():
    """
    Eliminar foto de perfil actual (el historial se mantiene)
    """
    try:
        from db_manager import delete_user_setting
        
        success = delete_user_setting('profile_picture')
        
        if success:
            return {
                "success": True,
                "message": "Foto de perfil eliminada"
            }
        else:
            return {
                "success": False,
                "message": "No habia foto de perfil"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# --- Endpoints para Ollama keep_alive ---

@router.get("/user/ollama-keep-alive", tags=["Usuario"])
async def get_ollama_keep_alive_setting():
    """
    Obtener configuracion actual de Ollama keep_alive desde BD
    
    Returns:
        Tiempo en segundos que Ollama mantiene el modelo en memoria
    """
    try:
        from db_manager import get_user_setting
        
        # Default: 30 segundos
        keep_alive = get_user_setting('ollama_keep_alive', default=30, setting_type='int')
        
        return {
            "keep_alive_seconds": keep_alive,
            "keep_alive_minutes": keep_alive / 60,
            "formatted": f"{keep_alive}s" if keep_alive < 60 else f"{keep_alive/60:.1f}m"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.post("/user/ollama-keep-alive", tags=["Usuario"])
async def set_ollama_keep_alive_setting(seconds: int):
    """
    Guardar configuracion de Ollama keep_alive en BD
    
    Args:
        seconds: Tiempo en segundos (1-3600)
    """
    try:
        from db_manager import set_user_setting
        from endpoints.shared_state import get_alfred_core_instance, is_alfred_core_initialized
        
        if seconds < 1 or seconds > 3600:
            raise HTTPException(status_code=400, detail="keep_alive debe estar entre 1 y 3600 segundos")
        
        success = set_user_setting('ollama_keep_alive', seconds, 'int')
        
        if success:
            # Actualizar en Alfred Core si esta inicializado
            if is_alfred_core_initialized():
                alfred_core = get_alfred_core_instance()
                alfred_core.set_ollama_keep_alive(seconds)
            
            return {
                "success": True,
                "message": f"keep_alive configurado a {seconds}s",
                "keep_alive_seconds": seconds
            }
        else:
            raise HTTPException(status_code=500, detail="Error al guardar configuracion")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")