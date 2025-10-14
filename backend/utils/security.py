from cryptography.fernet import Fernet
from utils.paths import get_data_path
import os
import base64

KEY_FILE = get_data_path() / "secret.key"

def generate_key():
    """Genera o carga la clave de cifrado"""
    if not KEY_FILE.exists():
        key = Fernet.generate_key()
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(KEY_FILE, "wb") as f:
            f.write(key)
    else:
        with open(KEY_FILE, "rb") as f:
            key = f.read()
    return key

def get_cipher():
    """Obtiene el cipher de Fernet con la clave actual"""
    return Fernet(generate_key())

def is_encryption_enabled():
    """Verifica si el cifrado esta habilitado en la configuracion"""
    try:
        from db_manager import get_user_setting
        enabled = get_user_setting('encryption_enabled', 'true')
        return enabled.lower() == 'true'
    except Exception:
        # Por defecto, el cifrado esta habilitado
        return True

def encrypt_data(data: str) -> str:
    """Cifra datos si el cifrado esta habilitado, de lo contrario devuelve texto plano"""
    if not data:
        return data
    
    if is_encryption_enabled():
        return get_cipher().encrypt(data.encode()).decode()
    return data

def decrypt_data(token: str) -> str:
    """Descifra datos si el cifrado esta habilitado, de lo contrario devuelve texto plano"""
    if not token:
        return token
    
    if is_encryption_enabled():
        try:
            return get_cipher().decrypt(token.encode()).decode()
        except Exception:
            # Si falla el descifrado, puede ser texto plano
            return token
    return token

def get_encryption_key_display():
    """Obtiene la clave de cifrado en formato legible para mostrar al usuario"""
    # Si no existe la clave, generarla primero
    if not KEY_FILE.exists():
        # Solo generar si el cifrado esta habilitado
        if is_encryption_enabled():
            generate_key()
        else:
            return None
    
    with open(KEY_FILE, "rb") as f:
        key = f.read()
    
    # La clave ya está en base64 (formato de Fernet), solo decodificar a string
    # NO volver a codificar en base64
    return key.decode('utf-8') if isinstance(key, bytes) else key

def encryption_key_exists():
    """Verifica si existe el archivo de clave"""
    return KEY_FILE.exists()
