# ===============================================
# ENDPOINTS DE SEGURIDAD Y CIFRADO
# ===============================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from utils.logger import get_logger

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("security")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class WelcomeSetupRequest(BaseModel):
    """Modelo para configuracion de bienvenida"""
    user_name: Optional[str] = Field(None, description="Nombre del usuario (opcional)")
    user_age: Optional[int] = Field(None, description="Edad del usuario (opcional)")
    profile_picture: Optional[str] = Field(None, description="Foto de perfil en base64 (opcional)")

class EncryptionSetupRequest(BaseModel):
    """Modelo para configurar el cifrado por primera vez"""
    enable_encryption: bool = Field(..., description="True para habilitar cifrado, False para texto plano")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/settings/welcome/status")
async def get_welcome_status():
    """
    Obtiene el estado de bienvenida inicial
    
    Returns:
        - needs_welcome: Si necesita mostrar el modal de bienvenida
    """
    from db_manager import get_user_setting
    
    try:
        needs_welcome = get_user_setting('needs_welcome_setup', 'false', 'bool')
        
        return {
            "success": True,
            "needs_welcome": needs_welcome
        }
    except Exception as e:
        backend_logger.error(f"Error al obtener estado de bienvenida: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/settings/welcome/complete")
async def complete_welcome_setup(request: WelcomeSetupRequest):
    """
    Completa la configuracion de bienvenida inicial
    
    Guarda nombre, edad y foto de perfil si se proporcionan
    """
    from db_manager import set_user_setting
    
    try:
        # Guardar nombre si se proporciono
        if request.user_name:
            set_user_setting('user_name', request.user_name, 'string')
            backend_logger.info(f"Nombre de usuario configurado: {request.user_name}")
        
        # Guardar edad si se proporciono
        if request.user_age:
            set_user_setting('user_age', request.user_age, 'int')
            backend_logger.info(f"Edad de usuario configurada: {request.user_age}")
        
        # Guardar foto de perfil si se proporciono
        if request.profile_picture:
            set_user_setting('profile_picture', request.profile_picture, 'string')
            backend_logger.info("Foto de perfil guardada")
        
        # Marcar que ya se completo la bienvenida
        set_user_setting('needs_welcome_setup', False, 'bool')
        
        return {
            "success": True,
            "message": "Configuracion de bienvenida completada"
        }
    except Exception as e:
        backend_logger.error(f"Error al completar bienvenida: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings/encryption/status")
async def get_encryption_status():
    """
    Obtiene el estado actual de configuracion de cifrado
    
    Returns:
        - encryption_enabled: Si el cifrado esta activo
        - needs_setup: Si es primera vez y necesita configurar
        - key_exists: Si existe el archivo de clave
    """
    from db_manager import get_user_setting
    
    try:
        from utils.security import is_encryption_enabled, encryption_key_exists
        
        needs_setup = get_user_setting('needs_encryption_setup', 'false', 'bool')
        encryption_enabled = is_encryption_enabled()
        key_exists = encryption_key_exists()
        
        return {
            "success": True,
            "encryption_enabled": encryption_enabled,
            "needs_setup": needs_setup,
            "key_exists": key_exists
        }
    except Exception as e:
        backend_logger.error(f"Error obteniendo estado de cifrado: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/settings/encryption/key")
async def get_encryption_key():
    """
    Obtiene la clave de cifrado en formato legible
    
    ADVERTENCIA: Esta clave es sensible y solo debe mostrarse al usuario
    de forma segura en la interfaz
    
    Returns:
        - key: Clave en formato base64
    """
    try:
        from utils.security import get_encryption_key_display, encryption_key_exists, is_encryption_enabled
        
        # Verificar si el cifrado esta habilitado
        if not is_encryption_enabled():
            raise HTTPException(
                status_code=400, 
                detail="El cifrado no esta habilitado. No hay clave que mostrar."
            )
        
        # Obtener la clave (se genera automaticamente si no existe)
        key = get_encryption_key_display()
        
        if not key:
            raise HTTPException(
                status_code=404, 
                detail="No se pudo obtener la clave de cifrado"
            )
        
        backend_logger.info("Clave de cifrado solicitada")
        
        return {
            "success": True,
            "key": key,
            "warning": "IMPORTANTE: Guarda esta clave en un lugar seguro. Si la pierdes, no podras descifrar tu informacion."
        }
    except HTTPException:
        raise
    except Exception as e:
        backend_logger.error(f"Error obteniendo clave de cifrado: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.post("/settings/encryption/setup")
async def setup_encryption(request: EncryptionSetupRequest):
    """
    Configura el cifrado por primera vez (solo en primera instalacion)
    
    Args:
        enable_encryption: True para habilitar, False para deshabilitar
    
    Returns:
        - encryption_enabled: Estado final
        - key: Clave generada (si se habilito)
    """
    from db_manager import get_user_setting, set_user_setting
    
    try:
        from utils.security import generate_key, get_encryption_key_display
        
        needs_setup = get_user_setting('needs_encryption_setup', 'false', 'bool')
        
        if not needs_setup:
            raise HTTPException(
                status_code=400, 
                detail="El cifrado ya fue configurado. Usa /settings/encryption/toggle para cambiar."
            )
        
        # Guardar preferencia
        set_user_setting('encryption_enabled', request.enable_encryption, 'bool')
        set_user_setting('needs_encryption_setup', False, 'bool')
        
        response = {
            "success": True,
            "encryption_enabled": request.enable_encryption,
            "message": "Cifrado habilitado" if request.enable_encryption else "Cifrado deshabilitado - datos en texto plano"
        }
        
        # Si se habilito, generar y devolver la clave
        if request.enable_encryption:
            generate_key()
            response["key"] = get_encryption_key_display()
            response["warning"] = "IMPORTANTE: Guarda esta clave en un lugar seguro. Si la pierdes, no podras descifrar tu informacion."
        
        backend_logger.info(f"Cifrado configurado: {'habilitado' if request.enable_encryption else 'deshabilitado'}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        backend_logger.error(f"Error configurando cifrado: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/security/encryption-key", tags=["Seguridad"])
async def get_encryption_key_for_frontend():
    """
    Obtiene la clave de cifrado para que el frontend pueda descifrar datos
    
    **IMPORTANTE**: Esta clave es la MISMA que se usa en el backend para cifrar.
    El frontend la utiliza para descifrar datos durante el transporte.
    
    Returns:
        - key: Clave Fernet en base64 (formato que entiende el frontend)
        - enabled: Si el cifrado esta habilitado
        - algorithm: "Fernet" (compatible con cryptography.fernet.Fernet)
    """
    try:
        from utils.security import get_encryption_key_display, is_encryption_enabled
        
        key = get_encryption_key_display()
        
        if not key:
            return {
                "success": True,
                "key": None,
                "enabled": False,
                "algorithm": "Fernet",
                "message": "Cifrado no habilitado"
            }
        
        return {
            "success": True,
            "key": key,
            "enabled": is_encryption_enabled(),
            "algorithm": "Fernet",
            "message": "Clave obtenida exitosamente"
        }
        
    except Exception as e:
        backend_logger.error(f"Error obteniendo clave de cifrado para frontend: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
