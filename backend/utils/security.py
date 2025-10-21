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

def encrypt_for_transport(data: dict) -> dict:
    """
    Cifra datos sensibles en una respuesta para viaje seguro por la red
    
    Args:
        data: Diccionario con datos a cifrar (ej: respuesta QueryResponse)
        
    Returns:
        Diccionario con campos sensibles cifrados
    """
    if not is_encryption_enabled():
        return data
    
    encrypted_data = data.copy()
    
    # Campos sensibles que deben cifrarse
    sensitive_fields = ['answer', 'personal_data', 'user_input', 'assistant_output']
    
    for field in sensitive_fields:
        if field in encrypted_data and encrypted_data[field]:
            if isinstance(encrypted_data[field], dict):
                # Si es dict (como personal_data), convertir a JSON y cifrar
                import json
                encrypted_data[field] = encrypt_data(json.dumps(encrypted_data[field]))
            elif isinstance(encrypted_data[field], str):
                encrypted_data[field] = encrypt_data(encrypted_data[field])
            elif isinstance(encrypted_data[field], list):
                # Si es lista (como sources), convertir a JSON y cifrar
                import json
                encrypted_data[field] = encrypt_data(json.dumps(encrypted_data[field]))
    
    return encrypted_data

def decrypt_from_transport(data: dict) -> dict:
    """
    Descifra datos recibidos del viaje por la red
    
    Args:
        data: Diccionario con datos cifrados
        
    Returns:
        Diccionario con campos sensibles descifrados
    """
    if not is_encryption_enabled():
        return data
    
    decrypted_data = data.copy()
    
    # Campos que pueden haber sido cifrados
    sensitive_fields = ['answer', 'personal_data', 'user_input', 'assistant_output']
    
    for field in sensitive_fields:
        if field in decrypted_data and decrypted_data[field]:
            try:
                decrypted_value = decrypt_data(decrypted_data[field])
                # Intentar parsear si es JSON
                if decrypted_value.startswith(('{', '[')):
                    import json
                    decrypted_data[field] = json.loads(decrypted_value)
                else:
                    decrypted_data[field] = decrypted_value
            except Exception as e:
                # Si falla descifrado, dejar como estaba
                print(f"Warning: No se pudo descifrar campo {field}: {str(e)}")
    
    return decrypted_data
