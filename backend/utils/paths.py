import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def get_data_path():
    # Obtener ruta desde variable de entorno, expandiendo variables de Windows como %AppData%
    default_path = Path.home() / "AppData" / "Roaming" / "Alfred" / "data"
    env_path = os.getenv("ALFRED_DATA_PATH")
    
    if env_path:
        # Expandir variables de entorno de Windows (%AppData%, %USERPROFILE%, etc.)
        expanded_path = Path(os.path.expandvars(env_path))
        base = expanded_path
    else:
        base = default_path
    
    base.mkdir(parents=True, exist_ok=True)
    return base

def get_log_path():
    # Obtener ruta desde variable de entorno, expandiendo variables de Windows
    default_path = Path.home() / "AppData" / "Roaming" / "Alfred" / "logs"
    env_path = os.getenv("ALFRED_LOG_PATH")
    
    if env_path:
        expanded_path = Path(os.path.expandvars(env_path))
        path = expanded_path
    else:
        path = default_path
    
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_db_path():
    # Obtener ruta desde variable de entorno, expandiendo variables de Windows
    default_path = Path.home() / "AppData" / "Roaming" / "Alfred" / "db"
    env_path = os.getenv("ALFRED_DB_PATH")
    
    if env_path:
        expanded_path = Path(os.path.expandvars(env_path))
        path = expanded_path
    else:
        path = default_path
    
    path.mkdir(parents=True, exist_ok=True)
    return path
