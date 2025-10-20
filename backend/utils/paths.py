import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def is_development_mode():
    """
    Detecta si estamos en modo desarrollo.
    
    Retorna True si:
    - ALFRED_DEV_MODE=1 esta establecido explicitamente
    - O si ./chroma_db existe (fallback automático para scripts locales)
    
    Retorna False (produccion) por defecto.
    """
    dev_mode = os.getenv("ALFRED_DEV_MODE", "0").lower()
    if dev_mode == "1" or dev_mode == "true":
        return True
    
    # Fallback: detectar por archivo local
    if Path("./chroma_db").exists() or Path("../chroma_db").exists():
        return True
    
    return False

def get_data_path():
    """
    Obtiene la ruta de datos persistentes.
    - DESARROLLO: ./data (en el directorio del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\data
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local
        base = Path("./data")
    else:
        # PRODUCCION: Usar AppData del usuario Windows
        env_path = os.getenv("ALFRED_DATA_PATH")
        if env_path:
            # Si se define variable de entorno, usarla (con expansión de %AppData%, etc.)
            base = Path(os.path.expandvars(env_path))
        else:
            # Ruta por defecto: C:\Users\{USER}\AppData\Roaming\Alfred\data
            base = Path.home() / "AppData" / "Roaming" / "Alfred" / "data"
    
    base.mkdir(parents=True, exist_ok=True)
    return base

def get_log_path():
    """
    Obtiene la ruta de logs.
    - DESARROLLO: ./logs (en el directorio del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\logs
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local
        path = Path("./logs")
    else:
        # PRODUCCION: Usar AppData del usuario Windows
        env_path = os.getenv("ALFRED_LOG_PATH")
        if env_path:
            # Si se define variable de entorno, usarla
            path = Path(os.path.expandvars(env_path))
        else:
            # Ruta por defecto: C:\Users\{USER}\AppData\Roaming\Alfred\logs
            path = Path.home() / "AppData" / "Roaming" / "Alfred" / "logs"
    
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_db_path():
    """
    Obtiene la ruta de base de datos SQLite.
    - DESARROLLO: ./db (en el directorio del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\db
    
    Almacena: alfred.db (conversaciones, Q&A history, metadata)
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local
        path = Path("./db")
    else:
        # PRODUCCION: Usar AppData del usuario Windows
        env_path = os.getenv("ALFRED_DB_PATH")
        if env_path:
            # Si se define variable de entorno, usarla
            path = Path(os.path.expandvars(env_path))
        else:
            # Ruta por defecto: C:\Users\{USER}\AppData\Roaming\Alfred\db
            path = Path.home() / "AppData" / "Roaming" / "Alfred" / "db"
    
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_chroma_path():
    """
    Obtiene la ruta de ChromaDB (base de datos vectorial).
    - DESARROLLO: ./chroma_db (en el directorio del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\data\\chroma_store
    
    Almacena: Indices vectoriales de embeddings y metadata de documentos
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local
        path = Path("./chroma_db")
    else:
        # PRODUCCION: Usar AppData del usuario Windows
        env_path = os.getenv("ALFRED_CHROMA_PATH")
        if env_path:
            # Si se define variable de entorno, usarla
            path = Path(os.path.expandvars(env_path))
        else:
            # Ruta por defecto: C:\Users\{USER}\AppData\Roaming\Alfred\data\chroma_store
            data_path = get_data_path()
            path = data_path / "chroma_store"
    
    path.mkdir(parents=True, exist_ok=True)
    return str(path)

