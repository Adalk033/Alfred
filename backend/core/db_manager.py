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

    conn.commit()
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


