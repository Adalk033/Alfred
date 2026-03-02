import os
from pathlib import Path

def is_development_mode():
    """
    Detecta si estamos en modo desarrollo.
    
    Retorna True si:
    - ALFRED_DEV_MODE=1 esta establecido explicitamente
    - O si ../chroma_db existe en raiz del proyecto (fallback automatico para scripts locales)
    
    Retorna False (produccion) por defecto.
    """
    dev_mode = os.getenv("ALFRED_DEV_MODE", "0").lower()
    if dev_mode == "1" or dev_mode == "true":
        return True
    
    # Fallback: detectar por archivo local en raiz del proyecto
    project_root = Path(__file__).parent.parent.parent
    if (project_root / "chroma_db").exists():
        return True
    
    return False

def get_data_path():
    """
    Obtiene la ruta de datos persistentes.
    - DESARROLLO: ../data (en el directorio raiz del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\data
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local en raiz del proyecto (un nivel arriba de backend/)
        base = Path(__file__).parent.parent.parent / "data"
    else:
        # PRODUCCION: Usar AppData del usuario
        # Ruta: ~/.local/share/Alfred/data (Linux) o C:\Users\{USER}\AppData\Roaming\Alfred\data (Windows)
        if os.name == 'nt':  # Windows
            base = Path.home() / "AppData" / "Roaming" / "Alfred" / "data"
        else:  # Linux/Mac
            base = Path.home() / ".local" / "share" / "Alfred" / "data"
    
    base.mkdir(parents=True, exist_ok=True)
    return base

def get_log_path():
    """
    Obtiene la ruta de logs.
    - DESARROLLO: ../logs (en el directorio raiz del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\logs
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local en raiz del proyecto (un nivel arriba de backend/)
        path = Path(__file__).parent.parent.parent / "logs"
    else:
        # PRODUCCION: Usar directorio de logs del usuario
        if os.name == 'nt':  # Windows
            path = Path.home() / "AppData" / "Roaming" / "Alfred" / "logs"
        else:  # Linux/Mac
            path = Path.home() / ".local" / "share" / "Alfred" / "logs"
    
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_db_path():
    """
    Obtiene la ruta de base de datos SQLite.
    - DESARROLLO: ../db (en el directorio raiz del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\db
    
    Almacena: alfred.db (conversaciones, Q&A history, metadata)
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local en raiz del proyecto (un nivel arriba de backend/)
        path = Path(__file__).parent.parent.parent / "db"
    else:
        # PRODUCCION: Usar directorio de BD del usuario
        if os.name == 'nt':  # Windows
            path = Path.home() / "AppData" / "Roaming" / "Alfred" / "db"
        else:  # Linux/Mac
            path = Path.home() / ".local" / "share" / "Alfred" / "db"
    
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_chroma_path():
    """
    Obtiene la ruta de ChromaDB (base de datos vectorial).
    - DESARROLLO: ../chroma_db (en el directorio raiz del proyecto)
    - PRODUCCION: C:\\Users\\{USER}\\AppData\\Roaming\\Alfred\\data\\chroma_store
    
    Almacena: Indices vectoriales de embeddings y metadata de documentos
    """
    if is_development_mode():
        # DESARROLLO: Usar carpeta local en raiz del proyecto (un nivel arriba de backend/)
        path = Path(__file__).parent.parent.parent / "chroma_db"
    else:
        # PRODUCCION: Usar directorio de ChromaDB dentro de data
        data_path = get_data_path()
        path = data_path / "chroma_store"
    
    path.mkdir(parents=True, exist_ok=True)
    return str(path)

