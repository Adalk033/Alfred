# db_manager.py
import sqlite3
from pathlib import Path
from utils.paths import get_db_path
from utils.security import encrypt_data, decrypt_data
from utils.logger import get_logger

db_logger = get_logger("db")

DB_FILE = get_db_path() / "alfred.db"

def get_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    # Verificar si es primera instalacion (DB no existe)
    is_first_run = not DB_FILE.exists()
    
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL,
        assistant_output TEXT NOT NULL,
        sources TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT,
        token TEXT,
        scopes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qa_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        personal_data TEXT,
        sources TEXT,
        verified INTEGER DEFAULT 1,
        encrypted INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_qa_history_timestamp ON qa_history(timestamp);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_qa_history_created_at ON qa_history(created_at DESC);
    """)

    # Nueva tabla para conversaciones (reemplaza JSON)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversation_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversation_threads(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_id ON conversation_messages(conversation_id);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_timestamp ON conversation_messages(timestamp);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_conversation_threads_updated ON conversation_threads(updated_at DESC);
    """)

    # Tabla para metadatos de documentos indexados (indexacion incremental)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        last_modified REAL NOT NULL,
        indexed_at TEXT NOT NULL,
        doc_type TEXT,
        chunk_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'indexed',
        error_message TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_documents_meta_file_hash ON documents_meta(file_hash);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_documents_meta_status ON documents_meta(status);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_documents_meta_indexed_at ON documents_meta(indexed_at DESC);
    """)

    # Tabla para configuracion de modelos (persistir ultimo modelo usado)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS model_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_model_settings_key ON model_settings(setting_key);
    """)

    # Tabla para configuracion de usuario (foto de perfil, preferencias UI, etc)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT,
        setting_type TEXT DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_user_settings_key ON user_settings(setting_key);
    """)

    # Tabla para historial de descargas de modelos de Ollama
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS model_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_model_downloads_name ON model_downloads(model_name);
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_model_downloads_status ON model_downloads(status);
    """)

    # Tabla para rutas de documentos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS document_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        enabled BOOLEAN DEFAULT 1,
        documents_count INTEGER DEFAULT 0,
        last_scan DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_document_paths_enabled ON document_paths(enabled);
    """)

    conn.commit()
    
    # Si es primera instalacion, marcar que necesita configurar cifrado
    if is_first_run:
        cursor.execute(
            "INSERT OR IGNORE INTO user_settings (setting_key, setting_value, setting_type) VALUES (?, ?, ?)",
            ('needs_encryption_setup', 'true', 'bool')
        )
        cursor.execute(
            "INSERT OR IGNORE INTO user_settings (setting_key, setting_value, setting_type) VALUES (?, ?, ?)",
            ('encryption_enabled', 'true', 'bool')
        )
        conn.commit()
        db_logger.info("Primera instalacion detectada - configuracion de cifrado pendiente")
    
    conn.close()
    db_logger.info("Base de datos inicializada correctamente")

def insert_conversation(user_input: str, assistant_output: str, sources: str = ""):
    conn = get_connection()
    cursor = conn.cursor()
    enc_user = encrypt_data(user_input)
    enc_assistant = encrypt_data(assistant_output)
    enc_sources = encrypt_data(sources)
    cursor.execute(
        "INSERT INTO conversations (user_input, assistant_output, sources) VALUES (?, ?, ?)",
        (enc_user, enc_assistant, enc_sources)
    )
    conn.commit()
    conn.close()

def get_recent_conversations(limit: int = 10):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "user_input": decrypt_data(row["user_input"]),
            "assistant_output": decrypt_data(row["assistant_output"]),
            "sources": decrypt_data(row["sources"]) if row["sources"] else ""
        }
        for row in rows
    ]

def search_conversations(query: str):
    conn = get_connection()
    cursor = conn.cursor()
    like_query = f"%{query}%"
    cursor.execute(
        "SELECT * FROM conversations WHERE user_input LIKE ? OR assistant_output LIKE ? ORDER BY timestamp DESC",
        (like_query, like_query)
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "user_input": decrypt_data(row["user_input"]),
            "assistant_output": decrypt_data(row["assistant_output"]),
            "sources": decrypt_data(row["sources"]) if row["sources"] else ""
        }
        for row in rows
    ]

# --- Funciones para Q&A History ---

def insert_qa_history(timestamp: str, question: str, answer: str, personal_data: dict = None, 
                      sources: list = None, verified: bool = True, encrypt_sensitive: bool = True):
    """
    Inserta una nueva entrada en el historial Q&A
    TODOS LOS CAMPOS DE TEXTO SE CIFRAN EN DISCO
    
    Args:
        timestamp: Timestamp ISO de la entrada
        question: Pregunta del usuario (se cifra)
        answer: Respuesta de Alfred (se cifra)
        personal_data: Diccionario con datos personales (se cifra)
        sources: Lista de fuentes utilizadas (se cifra)
        verified: Si la respuesta esta verificada
        encrypt_sensitive: Si se deben cifrar los datos sensibles (SIEMPRE True por defecto)
    
    Returns:
        ID de la entrada insertada o None en caso de error
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        import json
        
        # CIFRAR PREGUNTA (siempre)
        question_encrypted = encrypt_data(question)
        
        # CIFRAR RESPUESTA (siempre)
        answer_encrypted = encrypt_data(answer)
        
        # CIFRAR datos personales si existen
        personal_data_encrypted = None
        if personal_data:
            personal_data_str = json.dumps(personal_data, ensure_ascii=False)
            personal_data_encrypted = encrypt_data(personal_data_str)
        
        # CIFRAR sources si existen
        sources_encrypted = None
        if sources:
            sources_json = json.dumps(sources, ensure_ascii=False)
            sources_encrypted = encrypt_data(sources_json)
        
        cursor.execute(
            """INSERT INTO qa_history 
               (timestamp, question, answer, personal_data, sources, verified, encrypted) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (timestamp, question_encrypted, answer_encrypted, personal_data_encrypted, 
             sources_encrypted, 1 if verified else 0, 1)  # encrypted siempre 1
        )
        conn.commit()
        row_id = cursor.lastrowid
        db_logger.info(f"Entrada Q&A insertada (cifrada): {row_id}")
        return row_id
    except Exception as e:
        db_logger.error(f"Error al insertar entrada Q&A: {e}")
        return None
    finally:
        conn.close()

def get_qa_history(limit: int = None, offset: int = 0, decrypt_sensitive: bool = True):
    """
    Obtiene el historial Q&A
    TODOS LOS CAMPOS SE DESCIFRAN AUTOMATICAMENTE
    
    Args:
        limit: Numero maximo de entradas a retornar
        offset: Numero de entradas a saltar
        decrypt_sensitive: Si se deben descifrar los datos (SIEMPRE True por defecto)
    
    Returns:
        Lista de diccionarios con las entradas del historial descifradas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if limit:
            cursor.execute(
                "SELECT * FROM qa_history ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            )
        else:
            cursor.execute("SELECT * FROM qa_history ORDER BY created_at DESC")
        
        rows = cursor.fetchall()
        
        import json
        history = []
        for row in rows:
            entry = {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "question": "",
                "answer": "",
                "personal_data": None,
                "sources": [],
                "verified": bool(row["verified"]),
                "encrypted": bool(row["encrypted"])
            }
            
            # DESCIFRAR pregunta
            if row["question"]:
                try:
                    entry["question"] = decrypt_data(row["question"])
                except Exception as e:
                    db_logger.error(f"Error al descifrar pregunta: {e}")
                    entry["question"] = "[Error al descifrar]"
            
            # DESCIFRAR respuesta
            if row["answer"]:
                try:
                    entry["answer"] = decrypt_data(row["answer"])
                except Exception as e:
                    db_logger.error(f"Error al descifrar respuesta: {e}")
                    entry["answer"] = "[Error al descifrar]"
            
            # DESCIFRAR datos personales si existen
            if row["personal_data"]:
                try:
                    personal_data_str = decrypt_data(row["personal_data"])
                    entry["personal_data"] = json.loads(personal_data_str)
                except Exception as e:
                    db_logger.error(f"Error al descifrar datos personales: {e}")
                    entry["personal_data"] = None
            
            # DESCIFRAR sources si existen
            if row["sources"]:
                try:
                    sources_str = decrypt_data(row["sources"])
                    entry["sources"] = json.loads(sources_str)
                except Exception as e:
                    db_logger.error(f"Error al descifrar sources: {e}")
                    entry["sources"] = []
            
            history.append(entry)
        
        return history
    except Exception as e:
        db_logger.error(f"Error al obtener historial Q&A: {e}")
        return []
    finally:
        conn.close()

def search_qa_history(question: str, threshold: float = 0.3, top_k: int = 10):
    """
    Busca en el historial Q&A por similitud de keywords
    
    Args:
        question: Pregunta a buscar
        threshold: Umbral minimo de similitud (no usado actualmente, se hace en Python)
        top_k: Numero maximo de resultados
    
    Returns:
        Lista de diccionarios con las entradas encontradas
    """
    # Obtener todo el historial y hacer busqueda en Python
    # (SQLite no tiene busqueda semantica nativa)
    history = get_qa_history(decrypt_sensitive=True)
    
    # La logica de busqueda se mantiene en functionsToHistory.py
    # Esta funcion solo retorna el historial para que la busqueda se haga alli
    return history

def delete_qa_history(timestamp: str):
    """
    Elimina una entrada del historial Q&A por su timestamp
    
    Args:
        timestamp: Timestamp ISO de la entrada a eliminar
    
    Returns:
        True si se elimino exitosamente, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM qa_history WHERE timestamp = ?", (timestamp,))
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"Entrada Q&A eliminada: {timestamp}")
        else:
            db_logger.warning(f"No se encontro entrada con timestamp: {timestamp}")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar entrada Q&A: {e}")
        return False
    finally:
        conn.close()

def get_qa_history_stats():
    """
    Obtiene estadisticas del historial Q&A
    
    Returns:
        Diccionario con estadisticas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) as total FROM qa_history")
        total = cursor.fetchone()["total"]
        
        cursor.execute("SELECT COUNT(*) as verified FROM qa_history WHERE verified = 1")
        verified = cursor.fetchone()["verified"]
        
        cursor.execute("SELECT COUNT(*) as with_personal_data FROM qa_history WHERE personal_data IS NOT NULL")
        with_personal_data = cursor.fetchone()["with_personal_data"]
        
        return {
            "total": total,
            "verified": verified,
            "with_personal_data": with_personal_data
        }
    except Exception as e:
        db_logger.error(f"Error al obtener estadisticas Q&A: {e}")
        return {"total": 0, "verified": 0, "with_personal_data": 0}
    finally:
        conn.close()

# --- Funciones para Memory (con cifrado completo) ---

def set_memory(key: str, value: str):
    """
    Guarda un valor en memoria cifrado
    
    Args:
        key: Clave (se cifra)
        value: Valor (se cifra)
    
    Returns:
        True si se guardo exitosamente, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR clave y valor
        key_encrypted = encrypt_data(key)
        value_encrypted = encrypt_data(value)
        
        cursor.execute(
            """INSERT OR REPLACE INTO memory (key, value, updated_at) 
               VALUES (?, ?, CURRENT_TIMESTAMP)""",
            (key_encrypted, value_encrypted)
        )
        conn.commit()
        db_logger.info(f"Memoria actualizada (cifrada): {key[:20]}...")
        return True
    except Exception as e:
        db_logger.error(f"Error al guardar en memoria: {e}")
        return False
    finally:
        conn.close()

def get_memory(key: str):
    """
    Obtiene un valor de memoria descifrado
    
    Args:
        key: Clave a buscar (se cifra para buscar)
    
    Returns:
        Valor descifrado o None si no existe
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR la clave para buscar
        key_encrypted = encrypt_data(key)
        
        cursor.execute("SELECT value FROM memory WHERE key = ?", (key_encrypted,))
        row = cursor.fetchone()
        
        if row and row["value"]:
            # DESCIFRAR el valor
            return decrypt_data(row["value"])
        return None
    except Exception as e:
        db_logger.error(f"Error al obtener de memoria: {e}")
        return None
    finally:
        conn.close()

def get_all_memory():
    """
    Obtiene todos los valores de memoria descifrados
    
    Returns:
        Diccionario con todas las entradas {key: value} descifradas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT key, value FROM memory")
        rows = cursor.fetchall()
        
        memory_dict = {}
        for row in rows:
            try:
                # DESCIFRAR clave y valor
                key_decrypted = decrypt_data(row["key"])
                value_decrypted = decrypt_data(row["value"]) if row["value"] else None
                memory_dict[key_decrypted] = value_decrypted
            except Exception as e:
                db_logger.error(f"Error al descifrar entrada de memoria: {e}")
        
        return memory_dict
    except Exception as e:
        db_logger.error(f"Error al obtener toda la memoria: {e}")
        return {}
    finally:
        conn.close()

def delete_memory(key: str):
    """
    Elimina un valor de memoria
    
    Args:
        key: Clave a eliminar (se cifra para buscar)
    
    Returns:
        True si se elimino, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR la clave para buscar
        key_encrypted = encrypt_data(key)
        
        cursor.execute("DELETE FROM memory WHERE key = ?", (key_encrypted,))
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"Entrada de memoria eliminada: {key[:20]}...")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar de memoria: {e}")
        return False
    finally:
        conn.close()

# --- Funciones para Model Settings (persistir configuracion de modelos) ---

def set_model_setting(key: str, value: str):
    """
    Guarda una configuracion de modelo (sin cifrar, es metadata del sistema)
    
    Args:
        key: Clave de configuracion (ej: 'last_used_model', 'last_embedding_model')
        value: Valor de configuracion (ej: 'gemma2:9b')
    
    Returns:
        True si se guardo exitosamente, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """INSERT OR REPLACE INTO model_settings (setting_key, setting_value, updated_at) 
               VALUES (?, ?, CURRENT_TIMESTAMP)""",
            (key, value)
        )
        conn.commit()
        db_logger.info(f"Model setting guardado: {key} = {value}")
        return True
    except Exception as e:
        db_logger.error(f"Error al guardar model setting: {e}")
        return False
    finally:
        conn.close()

def get_model_setting(key: str, default: str = None):
    """
    Obtiene una configuracion de modelo
    
    Args:
        key: Clave de configuracion
        default: Valor por defecto si no existe
    
    Returns:
        Valor de configuracion o default si no existe
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT setting_value FROM model_settings WHERE setting_key = ?", (key,))
        row = cursor.fetchone()
        
        if row and row["setting_value"]:
            return row["setting_value"]
        return default
    except Exception as e:
        db_logger.error(f"Error al obtener model setting: {e}")
        return default
    finally:
        conn.close()

def get_all_model_settings():
    """
    Obtiene todas las configuraciones de modelos
    
    Returns:
        Diccionario con todas las configuraciones {key: value}
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT setting_key, setting_value, updated_at FROM model_settings")
        rows = cursor.fetchall()
        
        settings = {}
        for row in rows:
            settings[row["setting_key"]] = {
                "value": row["setting_value"],
                "updated_at": row["updated_at"]
            }
        
        return settings
    except Exception as e:
        db_logger.error(f"Error al obtener model settings: {e}")
        return {}
    finally:
        conn.close()

def delete_model_setting(key: str):
    """
    Elimina una configuracion de modelo
    
    Args:
        key: Clave a eliminar
    
    Returns:
        True si se elimino, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM model_settings WHERE setting_key = ?", (key,))
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"Model setting eliminado: {key}")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar model setting: {e}")
        return False
    finally:
        conn.close()

# --- Funciones para User Settings (configuracion de usuario) ---

def set_user_setting(key: str, value: any, setting_type: str = 'string'):
    """
    Guarda una configuracion de usuario
    
    Args:
        key: Clave de configuracion (ej: 'profile_picture', 'ollama_keep_alive')
        value: Valor de configuracion (se convierte a string si es necesario)
        setting_type: Tipo de dato ('string', 'int', 'float', 'bool', 'json')
    
    Returns:
        True si se guardo exitosamente, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        import json
        
        # Convertir valor segun tipo
        if setting_type == 'json':
            value_str = json.dumps(value, ensure_ascii=False)
        elif setting_type == 'bool':
            value_str = '1' if value else '0'
        else:
            value_str = str(value)
        
        cursor.execute(
            """INSERT OR REPLACE INTO user_settings (setting_key, setting_value, setting_type, updated_at) 
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)""",
            (key, value_str, setting_type)
        )
        conn.commit()
        db_logger.info(f"User setting guardado: {key} ({setting_type})")
        return True
    except Exception as e:
        db_logger.error(f"Error al guardar user setting: {e}")
        return False
    finally:
        conn.close()

def get_user_setting(key: str, default: any = None, setting_type: str = 'string'):
    """
    Obtiene una configuracion de usuario
    
    Args:
        key: Clave de configuracion
        default: Valor por defecto si no existe
        setting_type: Tipo esperado ('string', 'int', 'float', 'bool', 'json')
    
    Returns:
        Valor de configuracion convertido al tipo correcto, o default si no existe
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT setting_value, setting_type FROM user_settings WHERE setting_key = ?", (key,))
        row = cursor.fetchone()
        
        if not row or row["setting_value"] is None:
            return default
        
        value_str = row["setting_value"]
        stored_type = row["setting_type"]
        
        # Convertir valor segun tipo almacenado
        import json
        
        if stored_type == 'json':
            return json.loads(value_str)
        elif stored_type == 'int':
            return int(value_str)
        elif stored_type == 'float':
            return float(value_str)
        elif stored_type == 'bool':
            return value_str == '1' or value_str.lower() == 'true'
        else:
            return value_str
    
    except Exception as e:
        db_logger.error(f"Error al obtener user setting: {e}")
        return default
    finally:
        conn.close()

def get_all_user_settings():
    """
    Obtiene todas las configuraciones de usuario
    
    Returns:
        Diccionario con todas las configuraciones {key: {value, type, updated_at}}
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        import json
        
        cursor.execute("SELECT setting_key, setting_value, setting_type, updated_at FROM user_settings")
        rows = cursor.fetchall()
        
        settings = {}
        for row in rows:
            value_str = row["setting_value"]
            setting_type = row["setting_type"]
            
            # Convertir valor
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
            
            settings[row["setting_key"]] = {
                "value": value,
                "type": setting_type,
                "updated_at": row["updated_at"]
            }
        
        return settings
    except Exception as e:
        db_logger.error(f"Error al obtener user settings: {e}")
        return {}
    finally:
        conn.close()

def delete_user_setting(key: str):
    """
    Elimina una configuracion de usuario
    
    Args:
        key: Clave a eliminar
    
    Returns:
        True si se elimino, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM user_settings WHERE setting_key = ?", (key,))
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"User setting eliminado: {key}")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar user setting: {e}")
        return False
    finally:
        conn.close()

# --- Funciones para Integrations (con cifrado completo) ---

def insert_integration(service: str, token: str, scopes: str = ""):
    """
    Guarda una integracion con cifrado completo
    
    Args:
        service: Nombre del servicio (se cifra)
        token: Token de autenticacion (se cifra)
        scopes: Permisos/scopes (se cifra)
    
    Returns:
        ID de la integracion o None en caso de error
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR todos los campos
        service_encrypted = encrypt_data(service)
        token_encrypted = encrypt_data(token)
        scopes_encrypted = encrypt_data(scopes) if scopes else None
        
        cursor.execute(
            """INSERT INTO integrations (service, token, scopes, updated_at) 
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)""",
            (service_encrypted, token_encrypted, scopes_encrypted)
        )
        conn.commit()
        row_id = cursor.lastrowid
        db_logger.info(f"Integracion guardada (cifrada): {service[:20]}... ID: {row_id}")
        return row_id
    except Exception as e:
        db_logger.error(f"Error al guardar integracion: {e}")
        return None
    finally:
        conn.close()

def get_integration(service: str):
    """
    Obtiene una integracion descifrada por nombre de servicio
    
    Args:
        service: Nombre del servicio (se cifra para buscar)
    
    Returns:
        Diccionario con los datos descifrados o None
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR el nombre del servicio para buscar
        service_encrypted = encrypt_data(service)
        
        cursor.execute(
            "SELECT id, service, token, scopes, updated_at FROM integrations WHERE service = ? ORDER BY updated_at DESC LIMIT 1",
            (service_encrypted,)
        )
        row = cursor.fetchone()
        
        if row:
            return {
                "id": row["id"],
                "service": decrypt_data(row["service"]),
                "token": decrypt_data(row["token"]),
                "scopes": decrypt_data(row["scopes"]) if row["scopes"] else "",
                "updated_at": row["updated_at"]
            }
        return None
    except Exception as e:
        db_logger.error(f"Error al obtener integracion: {e}")
        return None
    finally:
        conn.close()

def get_all_integrations():
    """
    Obtiene todas las integraciones descifradas
    
    Returns:
        Lista de diccionarios con todas las integraciones
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, service, token, scopes, updated_at FROM integrations")
        rows = cursor.fetchall()
        
        integrations = []
        for row in rows:
            try:
                integrations.append({
                    "id": row["id"],
                    "service": decrypt_data(row["service"]),
                    "token": decrypt_data(row["token"]),
                    "scopes": decrypt_data(row["scopes"]) if row["scopes"] else "",
                    "updated_at": row["updated_at"]
                })
            except Exception as e:
                db_logger.error(f"Error al descifrar integracion ID {row['id']}: {e}")
        
        return integrations
    except Exception as e:
        db_logger.error(f"Error al obtener integraciones: {e}")
        return []
    finally:
        conn.close()

def update_integration(service: str, token: str, scopes: str = None):
    """
    Actualiza una integracion existente
    
    Args:
        service: Nombre del servicio (se cifra para buscar)
        token: Nuevo token (se cifra)
        scopes: Nuevos scopes (se cifra, opcional)
    
    Returns:
        True si se actualizo, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR datos
        service_encrypted = encrypt_data(service)
        token_encrypted = encrypt_data(token)
        
        if scopes is not None:
            scopes_encrypted = encrypt_data(scopes)
            cursor.execute(
                """UPDATE integrations 
                   SET token = ?, scopes = ?, updated_at = CURRENT_TIMESTAMP 
                   WHERE service = ?""",
                (token_encrypted, scopes_encrypted, service_encrypted)
            )
        else:
            cursor.execute(
                """UPDATE integrations 
                   SET token = ?, updated_at = CURRENT_TIMESTAMP 
                   WHERE service = ?""",
                (token_encrypted, service_encrypted)
            )
        
        conn.commit()
        updated = cursor.rowcount > 0
        if updated:
            db_logger.info(f"Integracion actualizada (cifrada): {service[:20]}...")
        return updated
    except Exception as e:
        db_logger.error(f"Error al actualizar integracion: {e}")
        return False
    finally:
        conn.close()

def delete_integration(service: str):
    """
    Elimina una integracion
    
    Args:
        service: Nombre del servicio (se cifra para buscar)
    
    Returns:
        True si se elimino, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # CIFRAR el nombre del servicio para buscar
        service_encrypted = encrypt_data(service)
        
        cursor.execute("DELETE FROM integrations WHERE service = ?", (service_encrypted,))
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"Integracion eliminada: {service[:20]}...")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar integracion: {e}")
        return False
    finally:
        conn.close()

# --- Funciones para Conversations (con cifrado completo) ---

def create_conversation(conversation_id: str, title: str):
    """
    Crea una nueva conversacion cifrada
    
    Args:
        conversation_id: ID unico de la conversacion
        title: Titulo de la conversacion (se cifra)
    
    Returns:
        conversation_id si se creo exitosamente, None en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        from datetime import datetime
        now = datetime.now().isoformat()
        
        # CIFRAR titulo
        title_encrypted = encrypt_data(title)
        
        cursor.execute(
            """INSERT INTO conversation_threads (id, title, created_at, updated_at, message_count)
               VALUES (?, ?, ?, ?, 0)""",
            (conversation_id, title_encrypted, now, now)
        )
        conn.commit()
        db_logger.info(f"Conversacion creada (cifrada): {conversation_id}")
        return conversation_id
    except Exception as e:
        db_logger.error(f"Error al crear conversacion: {e}")
        return None
    finally:
        conn.close()

def add_message_to_conversation(conversation_id: str, role: str, content: str, 
                                timestamp: str, metadata: dict = None):
    """
    Agrega un mensaje cifrado a una conversacion
    
    Args:
        conversation_id: ID de la conversacion
        role: Rol del mensaje (user/assistant) - se cifra
        content: Contenido del mensaje - se cifra
        timestamp: Timestamp ISO del mensaje
        metadata: Metadata adicional - se cifra
    
    Returns:
        ID del mensaje insertado o None en caso de error
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        import json
        
        # CIFRAR role
        role_encrypted = encrypt_data(role)
        
        # CIFRAR contenido
        content_encrypted = encrypt_data(content)
        
        # CIFRAR metadata si existe
        metadata_encrypted = None
        if metadata:
            metadata_json = json.dumps(metadata, ensure_ascii=False)
            metadata_encrypted = encrypt_data(metadata_json)
        
        # Insertar mensaje
        cursor.execute(
            """INSERT INTO conversation_messages (conversation_id, role, content, timestamp, metadata)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation_id, role_encrypted, content_encrypted, timestamp, metadata_encrypted)
        )
        
        # Actualizar contador y timestamp de la conversacion
        from datetime import datetime
        cursor.execute(
            """UPDATE conversation_threads 
               SET message_count = message_count + 1, updated_at = ?
               WHERE id = ?""",
            (datetime.now().isoformat(), conversation_id)
        )
        
        conn.commit()
        message_id = cursor.lastrowid
        db_logger.info(f"Mensaje agregado (cifrado) a conversacion {conversation_id}: {message_id}")
        return message_id
    except Exception as e:
        db_logger.error(f"Error al agregar mensaje: {e}")
        return None
    finally:
        conn.close()

def get_conversation(conversation_id: str):
    """
    Obtiene una conversacion completa con todos sus mensajes descifrados
    
    Args:
        conversation_id: ID de la conversacion
    
    Returns:
        Diccionario con la conversacion y sus mensajes descifrados o None
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        import json
        
        # Obtener thread
        cursor.execute(
            "SELECT id, title, created_at, updated_at, message_count FROM conversation_threads WHERE id = ?",
            (conversation_id,)
        )
        thread_row = cursor.fetchone()
        
        if not thread_row:
            return None
        
        # DESCIFRAR titulo
        title_decrypted = decrypt_data(thread_row["title"])
        
        conversation = {
            "id": thread_row["id"],
            "title": title_decrypted,
            "created_at": thread_row["created_at"],
            "updated_at": thread_row["updated_at"],
            "message_count": thread_row["message_count"],
            "messages": []
        }
        
        # Obtener mensajes
        cursor.execute(
            """SELECT id, role, content, timestamp, metadata 
               FROM conversation_messages 
               WHERE conversation_id = ? 
               ORDER BY timestamp ASC""",
            (conversation_id,)
        )
        message_rows = cursor.fetchall()
        
        for msg_row in message_rows:
            try:
                # DESCIFRAR cada campo
                role_decrypted = decrypt_data(msg_row["role"])
                content_decrypted = decrypt_data(msg_row["content"])
                
                metadata_decrypted = {}
                if msg_row["metadata"]:
                    metadata_json = decrypt_data(msg_row["metadata"])
                    metadata_decrypted = json.loads(metadata_json)
                
                conversation["messages"].append({
                    "id": msg_row["id"],
                    "role": role_decrypted,
                    "content": content_decrypted,
                    "timestamp": msg_row["timestamp"],
                    "metadata": metadata_decrypted
                })
            except Exception as e:
                db_logger.error(f"Error al descifrar mensaje {msg_row['id']}: {e}")
        
        return conversation
    except Exception as e:
        db_logger.error(f"Error al obtener conversacion: {e}")
        return None
    finally:
        conn.close()

def list_conversations(limit: int = None, offset: int = 0):
    """
    Lista todas las conversaciones (solo metadata, sin mensajes)
    
    Args:
        limit: Numero maximo de conversaciones
        offset: Numero de conversaciones a saltar
    
    Returns:
        Lista de conversaciones con metadata descifrada
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if limit:
            cursor.execute(
                """SELECT id, title, created_at, updated_at, message_count 
                   FROM conversation_threads 
                   ORDER BY updated_at DESC 
                   LIMIT ? OFFSET ?""",
                (limit, offset)
            )
        else:
            cursor.execute(
                """SELECT id, title, created_at, updated_at, message_count 
                   FROM conversation_threads 
                   ORDER BY updated_at DESC"""
            )
        
        rows = cursor.fetchall()
        
        conversations = []
        for row in rows:
            try:
                # DESCIFRAR titulo
                title_decrypted = decrypt_data(row["title"])
                
                conversations.append({
                    "id": row["id"],
                    "title": title_decrypted,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "message_count": row["message_count"]
                })
            except Exception as e:
                db_logger.error(f"Error al descifrar conversacion {row['id']}: {e}")
        
        return conversations
    except Exception as e:
        db_logger.error(f"Error al listar conversaciones: {e}")
        return []
    finally:
        conn.close()

def update_conversation_title(conversation_id: str, new_title: str):
    """
    Actualiza el titulo de una conversacion
    
    Args:
        conversation_id: ID de la conversacion
        new_title: Nuevo titulo (se cifra)
    
    Returns:
        True si se actualizo, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        from datetime import datetime
        
        # CIFRAR nuevo titulo
        title_encrypted = encrypt_data(new_title)
        
        cursor.execute(
            """UPDATE conversation_threads 
               SET title = ?, updated_at = ?
               WHERE id = ?""",
            (title_encrypted, datetime.now().isoformat(), conversation_id)
        )
        conn.commit()
        updated = cursor.rowcount > 0
        if updated:
            db_logger.info(f"Titulo de conversacion actualizado (cifrado): {conversation_id}")
        return updated
    except Exception as e:
        db_logger.error(f"Error al actualizar titulo: {e}")
        return False
    finally:
        conn.close()

def delete_conversation(conversation_id: str):
    """
    Elimina una conversacion y todos sus mensajes
    
    Args:
        conversation_id: ID de la conversacion
    
    Returns:
        True si se elimino, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Primero eliminar mensajes (por si no hay CASCADE)
        cursor.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", (conversation_id,))
        
        # Luego eliminar thread
        cursor.execute("DELETE FROM conversation_threads WHERE id = ?", (conversation_id,))
        
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            db_logger.info(f"Conversacion eliminada: {conversation_id}")
        return deleted
    except Exception as e:
        db_logger.error(f"Error al eliminar conversacion: {e}")
        return False
    finally:
        conn.close()

def clear_conversation_messages(conversation_id: str):
    """
    Elimina todos los mensajes de una conversacion pero mantiene el thread
    
    Args:
        conversation_id: ID de la conversacion
    
    Returns:
        True si se limpio, False en caso contrario
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        from datetime import datetime
        
        # Eliminar mensajes
        cursor.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", (conversation_id,))
        
        # Resetear contador
        cursor.execute(
            """UPDATE conversation_threads 
               SET message_count = 0, updated_at = ?
               WHERE id = ?""",
            (datetime.now().isoformat(), conversation_id)
        )
        
        conn.commit()
        db_logger.info(f"Mensajes de conversacion limpiados: {conversation_id}")
        return True
    except Exception as e:
        db_logger.error(f"Error al limpiar mensajes: {e}")
        return False
    finally:
        conn.close()

def search_conversations(query: str):
    """
    Busca conversaciones por titulo
    NOTA: Como los titulos estan cifrados, esta funcion carga todas las conversaciones
    y busca en memoria despues de descifrar
    
    Args:
        query: Termino de busqueda
    
    Returns:
        Lista de conversaciones que coinciden
    """
    try:
        # Obtener todas las conversaciones descifradas
        all_conversations = list_conversations()
        
        # Filtrar por query (case-insensitive)
        query_lower = query.lower()
        matching = [
            conv for conv in all_conversations 
            if query_lower in conv["title"].lower()
        ]
        
        return matching
    except Exception as e:
        db_logger.error(f"Error al buscar conversaciones: {e}")
        return []

def get_conversation_stats():
    """
    Obtiene estadisticas de conversaciones
    
    Returns:
        Diccionario con estadisticas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) as total FROM conversation_threads")
        total_conversations = cursor.fetchone()["total"]
        
        cursor.execute("SELECT COUNT(*) as total FROM conversation_messages")
        total_messages = cursor.fetchone()["total"]
        
        cursor.execute("SELECT AVG(message_count) as avg FROM conversation_threads")
        avg_messages = cursor.fetchone()["avg"] or 0
        
        return {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "avg_messages_per_conversation": round(avg_messages, 2)
        }
    except Exception as e:
        db_logger.error(f"Error al obtener estadisticas de conversaciones: {e}")
        return {"total_conversations": 0, "total_messages": 0, "avg_messages_per_conversation": 0}
    finally:
        conn.close()


# --- Funciones para Document Metadata (indexacion incremental) ---

def insert_document_meta(file_path: str, file_hash: str, file_size: int, 
                        last_modified: float, indexed_at: str, doc_type: str = None,
                        chunk_count: int = 0, status: str = "indexed"):
    """
    Inserta o actualiza metadata de un documento indexado
    
    Args:
        file_path: Ruta completa del archivo
        file_hash: Hash SHA256 del archivo
        file_size: Tamano del archivo en bytes
        last_modified: Timestamp de ultima modificacion
        indexed_at: Timestamp ISO de indexacion
        doc_type: Extension del archivo (.pdf, .txt, etc)
        chunk_count: Numero de chunks generados
        status: Estado del documento (indexed, error, deleted)
    
    Returns:
        ID de la entrada insertada/actualizada o None en caso de error
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """INSERT INTO documents_meta 
               (file_path, file_hash, file_size, last_modified, indexed_at, doc_type, chunk_count, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(file_path) DO UPDATE SET
                   file_hash = excluded.file_hash,
                   file_size = excluded.file_size,
                   last_modified = excluded.last_modified,
                   indexed_at = excluded.indexed_at,
                   chunk_count = excluded.chunk_count,
                   status = excluded.status,
                   updated_at = CURRENT_TIMESTAMP""",
            (file_path, file_hash, file_size, last_modified, indexed_at, doc_type, chunk_count, status)
        )
        conn.commit()
        row_id = cursor.lastrowid
        db_logger.info(f"Metadata de documento guardada: {file_path}")
        return row_id
    except Exception as e:
        db_logger.error(f"Error al insertar metadata de documento: {e}")
        return None
    finally:
        conn.close()


def get_document_meta(file_path: str = None):
    """
    Obtiene metadata de documentos
    
    Args:
        file_path: Ruta del archivo especifico (opcional)
    
    Returns:
        Dict con metadata del documento o lista de todos si no se especifica file_path
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if file_path:
            cursor.execute(
                "SELECT * FROM documents_meta WHERE file_path = ?",
                (file_path,)
            )
            row = cursor.fetchone()
            
            if row:
                return dict(row)
            return None
        else:
            cursor.execute("SELECT * FROM documents_meta ORDER BY indexed_at DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    
    finally:
        conn.close()


def get_all_document_hashes():
    """
    Obtiene un diccionario con todos los hashes de documentos indexados
    
    Returns:
        Dict {file_path: file_hash}
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT file_path, file_hash FROM documents_meta WHERE status = 'indexed'")
        rows = cursor.fetchall()
        return {row['file_path']: row['file_hash'] for row in rows}
    
    finally:
        conn.close()


def delete_document_meta(file_path: str):
    """
    Elimina metadata de un documento
    
    Args:
        file_path: Ruta del archivo a eliminar
    
    Returns:
        True si se elimino correctamente
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM documents_meta WHERE file_path = ?", (file_path,))
        conn.commit()
        db_logger.info(f"Metadata de documento eliminada: {file_path}")
        return True
    except Exception as e:
        db_logger.error(f"Error al eliminar metadata de documento: {e}")
        return False
    finally:
        conn.close()


def update_document_status(file_path: str, status: str, error_message: str = None):
    """
    Actualiza el estado de un documento
    
    Args:
        file_path: Ruta del archivo
        status: Nuevo estado (indexed, error, deleted)
        error_message: Mensaje de error si aplica
    
    Returns:
        True si se actualizo correctamente
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """UPDATE documents_meta 
               SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
               WHERE file_path = ?""",
            (status, error_message, file_path)
        )
        conn.commit()
        return True
    except Exception as e:
        db_logger.error(f"Error al actualizar estado de documento: {e}")
        return False
    finally:
        conn.close()


def get_document_stats():
    """
    Obtiene estadisticas de documentos indexados
    
    Returns:
        Dict con estadisticas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) as total FROM documents_meta")
        total = cursor.fetchone()['total']
        
        cursor.execute("SELECT COUNT(*) as indexed FROM documents_meta WHERE status = 'indexed'")
        indexed = cursor.fetchone()['indexed']
        
        cursor.execute("SELECT COUNT(*) as errors FROM documents_meta WHERE status = 'error'")
        errors = cursor.fetchone()['errors']
        
        cursor.execute("SELECT SUM(chunk_count) as total_chunks FROM documents_meta WHERE status = 'indexed'")
        total_chunks = cursor.fetchone()['total_chunks'] or 0
        
        cursor.execute("SELECT SUM(file_size) as total_size FROM documents_meta WHERE status = 'indexed'")
        total_size = cursor.fetchone()['total_size'] or 0
        
        return {
            'total_documents': total,
            'indexed_documents': indexed,
            'error_documents': errors,
            'total_chunks': total_chunks,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2)
        }
    
    finally:
        conn.close()


# ====================================
# FUNCIONES PARA GESTION DE MODELOS
# ====================================

def save_model_download_history(model_name: str, status: str, message: str = "", progress: int = 0):
    """
    Guardar registro de descarga/eliminacion de modelo en historial
    
    Args:
        model_name: Nombre del modelo
        status: Estado (downloading, completed, failed, deleted)
        message: Mensaje adicional
        progress: Progreso de descarga (0-100)
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO model_downloads (model_name, status, progress, message, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        """, (model_name, status, progress, message))
        
        conn.commit()
        db_logger.info(f"Historial de modelo guardado: {model_name} - {status} - {progress}%")
        
    except Exception as e:
        db_logger.error(f"Error al guardar historial de modelo: {str(e)}")
        conn.rollback()
        raise
    
    finally:
        conn.close()


def update_model_download_progress(model_name: str, progress: int, message: str = ""):
    """
    Actualizar progreso de descarga de un modelo
    
    Args:
        model_name: Nombre del modelo
        progress: Progreso (0-100)
        message: Mensaje opcional
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Actualizar el ultimo registro de este modelo que este en estado downloading
        cursor.execute("""
            UPDATE model_downloads 
            SET progress = ?, message = ?, updated_at = datetime('now')
            WHERE model_name = ? 
            AND status = 'downloading'
            AND id = (
                SELECT id FROM model_downloads 
                WHERE model_name = ? AND status = 'downloading'
                ORDER BY created_at DESC LIMIT 1
            )
        """, (progress, message, model_name, model_name))
        
        conn.commit()
        
    except Exception as e:
        db_logger.error(f"Error al actualizar progreso: {str(e)}")
        conn.rollback()
    
    finally:
        conn.close()


def get_model_download_history(limit: int = 50):
    """
    Obtener historial de descargas de modelos
    
    Args:
        limit: Numero maximo de registros a retornar
        
    Returns:
        Lista de diccionarios con el historial
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                id,
                model_name,
                status,
                progress,
                message,
                created_at,
                updated_at
            FROM model_downloads
            ORDER BY updated_at DESC
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        
        return [
            {
                "id": row["id"],
                "model_name": row["model_name"],
                "status": row["status"],
                "progress": row["progress"],
                "message": row["message"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            }
            for row in rows
        ]
        
    except Exception as e:
        db_logger.error(f"Error al obtener historial de modelos: {str(e)}")
        return []
    
    finally:
        conn.close()


def get_model_download_status(model_name: str):
    """
    Obtener el ultimo estado de descarga de un modelo especifico
    
    Args:
        model_name: Nombre del modelo
        
    Returns:
        Diccionario con el estado o None si no existe
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                id,
                model_name,
                status,
                progress,
                message,
                created_at,
                updated_at
            FROM model_downloads
            WHERE model_name = ?
            ORDER BY updated_at DESC
            LIMIT 1
        """, (model_name,))
        
        row = cursor.fetchone()
        
        if row:
            return {
                "id": row["id"],
                "model_name": row["model_name"],
                "status": row["status"],
                "progress": row["progress"],
                "message": row["message"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            }
        
        return None
        
    except Exception as e:
        db_logger.error(f"Error al obtener estado de modelo: {str(e)}")
        return None
    
    finally:
        conn.close()


# ===============================================
# FUNCIONES PARA GESTION DE RUTAS DE DOCUMENTOS
# ===============================================

def add_document_path(path: str) -> bool:
    """
    Agregar una nueva ruta de documentos
    
    Args:
        path: Ruta absoluta del directorio
        
    Returns:
        True si se agrego exitosamente, False si ya existe o hay error
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO document_paths (path, enabled, documents_count)
            VALUES (?, 1, 0)
        """, (path,))
        
        conn.commit()
        db_logger.info(f"Ruta de documentos agregada: {path}")
        return True
        
    except sqlite3.IntegrityError:
        db_logger.warning(f"La ruta ya existe: {path}")
        return False
        
    except Exception as e:
        db_logger.error(f"Error al agregar ruta: {str(e)}")
        return False
        
    finally:
        conn.close()


def get_document_paths(enabled_only: bool = True) -> list:
    """
    Obtener lista de rutas de documentos
    
    Args:
        enabled_only: Si es True, solo retorna rutas habilitadas
        
    Returns:
        Lista de diccionarios con informacion de las rutas
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if enabled_only:
            cursor.execute("""
                SELECT id, path, enabled, documents_count, last_scan, created_at, updated_at
                FROM document_paths
                WHERE enabled = 1
                ORDER BY created_at ASC
            """)
        else:
            cursor.execute("""
                SELECT id, path, enabled, documents_count, last_scan, created_at, updated_at
                FROM document_paths
                ORDER BY created_at ASC
            """)
        
        rows = cursor.fetchall()
        
        paths = []
        for row in rows:
            paths.append({
                "id": row["id"],
                "path": row["path"],
                "enabled": bool(row["enabled"]),
                "documents_count": row["documents_count"],
                "last_scan": row["last_scan"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            })
        
        return paths
        
    except Exception as e:
        db_logger.error(f"Error al obtener rutas: {str(e)}")
        return []
        
    finally:
        conn.close()


def update_document_path(path_id: int, new_path: str = None, enabled: bool = None, documents_count: int = None) -> bool:
    """
    Actualizar una ruta de documentos
    
    Args:
        path_id: ID de la ruta a actualizar
        new_path: Nueva ruta (opcional)
        enabled: Estado habilitado/deshabilitado (opcional)
        documents_count: Nuevo conteo de documentos (opcional)
        
    Returns:
        True si se actualizo exitosamente
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        updates = []
        params = []
        
        if new_path is not None:
            updates.append("path = ?")
            params.append(new_path)
        
        if enabled is not None:
            updates.append("enabled = ?")
            params.append(1 if enabled else 0)
        
        if documents_count is not None:
            updates.append("documents_count = ?")
            params.append(documents_count)
        
        if not updates:
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        
        query = f"UPDATE document_paths SET {', '.join(updates)} WHERE id = ?"
        params.append(path_id)
        
        cursor.execute(query, params)
        conn.commit()
        
        db_logger.info(f"Ruta de documentos actualizada: ID {path_id}")
        return cursor.rowcount > 0
        
    except Exception as e:
        db_logger.error(f"Error al actualizar ruta: {str(e)}")
        return False
        
    finally:
        conn.close()


def delete_document_path(path_id: int) -> bool:
    """
    Eliminar una ruta de documentos
    
    Args:
        path_id: ID de la ruta a eliminar
        
    Returns:
        True si se elimino exitosamente
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM document_paths WHERE id = ?", (path_id,))
        conn.commit()
        
        db_logger.info(f"Ruta de documentos eliminada: ID {path_id}")
        return cursor.rowcount > 0
        
    except Exception as e:
        db_logger.error(f"Error al eliminar ruta: {str(e)}")
        return False
        
    finally:
        conn.close()


def update_path_scan_time(path_id: int) -> bool:
    """
    Actualizar la fecha de ultimo escaneo de una ruta
    
    Args:
        path_id: ID de la ruta
        
    Returns:
        True si se actualizo exitosamente
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE document_paths 
            SET last_scan = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (path_id,))
        
        conn.commit()
        return cursor.rowcount > 0
        
    except Exception as e:
        db_logger.error(f"Error al actualizar tiempo de escaneo: {str(e)}")
        return False
        
    finally:
        conn.close()
