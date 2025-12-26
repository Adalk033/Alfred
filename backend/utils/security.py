from cryptography.fernet import Fernet
from utils.paths import get_data_path
import os
import base64
import re
from pathlib import Path
from typing import Tuple, Optional

KEY_FILE = get_data_path() / "secret.key"

# ============================================================================
# PATH VALIDATION - Prevencion de Path Traversal
# ============================================================================

# Rutas del sistema que nunca deben ser accesibles
FORBIDDEN_PATHS_UNIX = [
    '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/boot', '/dev',
    '/proc', '/sys', '/var/log', '/root', '/lib', '/lib64', '/opt',
    '/run', '/snap', '/srv', '/tmp', '/var/run', '/var/tmp'
]

FORBIDDEN_PATHS_WINDOWS = [
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    'C:\\ProgramData', 'C:\\System Volume Information', 'C:\\$Recycle.Bin',
    'C:\\Recovery', 'C:\\Users\\Default', 'C:\\Users\\Public',
    'C:\\PerfLogs', 'C:\\Windows\\System32'
]

# Patrones peligrosos en rutas
DANGEROUS_PATTERNS = [
    r'\.\./',           # Path traversal Unix
    r'\.\.',            # Path traversal generico
    r'\.\.\\',          # Path traversal Windows
    r'^~',              # Home directory expansion
    r'\$\{',            # Variable expansion
    r'\$\(',            # Command substitution
    r'`',               # Command substitution backticks
    r'\|',              # Pipe
    r';',               # Command separator
    r'&',               # Background/AND operator
    r'>',               # Redirect
    r'<',               # Redirect
    r'\0',              # Null byte
]


def validate_document_path(path_input: str) -> Tuple[bool, str, Optional[Path]]:
    """
    Valida una ruta de documentos para prevenir ataques de Path Traversal
    
    Args:
        path_input: Ruta proporcionada por el usuario
        
    Returns:
        Tuple de (es_valida, mensaje_error, ruta_segura)
        - es_valida: True si la ruta es segura
        - mensaje_error: Descripcion del error si no es valida
        - ruta_segura: Path object seguro si es valida, None si no
    """
    if not path_input or not isinstance(path_input, str):
        return False, "La ruta no puede estar vacia", None
    
    # Limpiar espacios
    path_input = path_input.strip()
    
    if not path_input:
        return False, "La ruta no puede estar vacia", None
    
    # Verificar patrones peligrosos ANTES de resolver la ruta
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, path_input):
            return False, f"La ruta contiene caracteres no permitidos", None
    
    try:
        # Resolver la ruta absoluta de forma segura
        # Esto resuelve symlinks y normaliza la ruta
        path_obj = Path(path_input).resolve()
        resolved_path = str(path_obj)
        
        # Verificar que la ruta resuelta no contiene path traversal
        # (por si acaso resolve() no lo manejo completamente)
        if '..' in resolved_path:
            return False, "La ruta contiene secuencias de navegacion no permitidas", None
        
        # Verificar rutas del sistema prohibidas
        forbidden_paths = FORBIDDEN_PATHS_UNIX if os.name != 'nt' else FORBIDDEN_PATHS_WINDOWS
        
        resolved_lower = resolved_path.lower()
        for forbidden in forbidden_paths:
            forbidden_lower = forbidden.lower()
            if resolved_lower == forbidden_lower or resolved_lower.startswith(forbidden_lower + os.sep):
                return False, f"No se permite acceso a rutas del sistema", None
        
        # Verificar que la ruta existe
        if not path_obj.exists():
            return False, "La ruta especificada no existe", None
        
        # Verificar que es un directorio
        if not path_obj.is_dir():
            return False, "La ruta especificada no es un directorio", None
        
        # Verificar permisos de lectura
        if not os.access(path_obj, os.R_OK):
            return False, "No hay permisos de lectura para esta ruta", None
        
        return True, "", path_obj
        
    except PermissionError:
        return False, "No hay permisos para acceder a esta ruta", None
    except OSError as e:
        return False, f"Error al acceder a la ruta: {str(e)}", None
    except Exception as e:
        return False, f"Error al validar la ruta", None


def is_path_within_allowed(path: Path, allowed_base: Path) -> bool:
    """
    Verifica que una ruta este dentro de un directorio base permitido
    
    Args:
        path: Ruta a verificar
        allowed_base: Directorio base permitido
        
    Returns:
        True si la ruta esta dentro del directorio base
    """
    try:
        resolved_path = path.resolve()
        resolved_base = allowed_base.resolve()
        
        # Verificar que la ruta resuelta comience con el directorio base
        return str(resolved_path).startswith(str(resolved_base))
    except Exception:
        return False

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
