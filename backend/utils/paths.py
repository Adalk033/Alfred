import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def get_data_path():
    base = Path(os.getenv("ALFRED_DATA_PATH", Path.home() / "AppData/Roaming/Alfred/data"))
    base.mkdir(parents=True, exist_ok=True)
    return base

def get_log_path():
    path = Path(os.getenv("ALFRED_LOG_PATH", Path.home() / "AppData/Roaming/Alfred/logs"))
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_db_path():
    path = Path(os.getenv("ALFRED_DB_PATH", Path.home() / "AppData/Roaming/Alfred/db"))
    path.mkdir(parents=True, exist_ok=True)
    return path
