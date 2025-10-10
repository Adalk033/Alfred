"""
Conversation Manager - Sistema de gestion de conversaciones
Maneja la creacion, guardado, carga y listado de conversaciones
Diferente del historial Q&A que optimiza respuestas
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from uuid import uuid4
from utils.security import encrypt_data, decrypt_data


class ConversationManager:
    """Gestor de conversaciones de Alfred"""
    
    def __init__(self, conversations_dir: str = "./conversations"):
        """
        Inicializar el gestor de conversaciones
        
        Args:
            conversations_dir: Directorio donde se guardaran las conversaciones
        """
        self.conversations_dir = Path(conversations_dir)
        self.conversations_dir.mkdir(exist_ok=True)
        
        # Archivo indice para metadata rapida
        self.index_file = self.conversations_dir / "conversations_index.json"
        self._ensure_index_exists()
    
    def _ensure_index_exists(self):
        """Asegurar que el archivo indice existe"""
        if not self.index_file.exists():
            self._save_index([])
    
    def _load_index(self, decrypt_titles: bool = True) -> List[Dict[str, Any]]:
        """
        Cargar el indice de conversaciones
        
        Args:
            decrypt_titles: Si True, descifra los titulos del indice
        
        Returns:
            Lista de entradas del indice
        """
        try:
            with open(self.index_file, 'r', encoding='utf-8') as f:
                index = json.load(f)
            
            # Descifrar titulos si es necesario
            if decrypt_titles:
                for entry in index:
                    if entry.get('title_encrypted', False):
                        entry['title'] = self._decrypt_conversation_title(entry['title'])
                        # No eliminar el flag para saber que debe cifrarse al guardar
            
            return index
        except Exception as e:
            print(f"Error al cargar indice: {e}")
            return []
    
    def _save_index(self, index: List[Dict[str, Any]], encrypt_titles: bool = True):
        """
        Guardar el indice de conversaciones
        
        Args:
            index: Lista de entradas del indice
            encrypt_titles: Si True, cifra los titulos antes de guardar
        """
        try:
            # Crear copia para no modificar el original
            index_to_save = []
            
            for entry in index:
                entry_copy = entry.copy()
                
                # Cifrar titulo si es necesario
                if encrypt_titles and entry_copy.get('title'):
                    # Verificar si el titulo parece estar cifrado (texto largo con base64)
                    title = entry_copy['title']
                    is_encrypted = len(title) > 50 and '=' in title
                    
                    # Cifrar solo si NO esta cifrado
                    if not is_encrypted:
                        entry_copy['title'] = self._encrypt_conversation_title(title)
                        entry_copy['title_encrypted'] = True
                    else:
                        # Ya esta cifrado, mantener el flag
                        entry_copy['title_encrypted'] = True
                
                index_to_save.append(entry_copy)
            
            with open(self.index_file, 'w', encoding='utf-8') as f:
                json.dump(index_to_save, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error al guardar indice: {e}")
    
    def _get_conversation_file(self, conversation_id: str) -> Path:
        """Obtener la ruta del archivo de una conversacion"""
        return self.conversations_dir / f"{conversation_id}.json"
    
    def _encrypt_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cifra un mensaje completo (role, contenido y metadata)
        
        Args:
            message: Diccionario con el mensaje completo
        
        Returns:
            Diccionario con mensaje cifrado
        """
        encrypted_message = message.copy()
        
        # Cifrar el role del mensaje
        if 'role' in encrypted_message and encrypted_message['role']:
            try:
                encrypted_message['role'] = encrypt_data(encrypted_message['role'])
            except Exception as e:
                print(f"Error al cifrar role del mensaje: {e}")
        
        # Cifrar el contenido del mensaje
        if 'content' in encrypted_message and encrypted_message['content']:
            try:
                encrypted_message['content'] = encrypt_data(encrypted_message['content'])
            except Exception as e:
                print(f"Error al cifrar contenido del mensaje: {e}")
        
        # Cifrar metadata completa si existe
        if 'metadata' in encrypted_message and encrypted_message['metadata']:
            try:
                # Convertir metadata a JSON y cifrar
                import json
                metadata_json = json.dumps(encrypted_message['metadata'], ensure_ascii=False)
                encrypted_message['metadata'] = encrypt_data(metadata_json)
            except Exception as e:
                print(f"Error al cifrar metadata: {e}")
        
        # Marcar como cifrado
        encrypted_message['encrypted'] = True
        
        return encrypted_message
    
    def _decrypt_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Descifra un mensaje completo (role, contenido y metadata)
        
        Args:
            message: Diccionario con mensaje cifrado
        
        Returns:
            Diccionario con mensaje descifrado
        """
        if not message.get('encrypted', False):
            return message
        
        decrypted_message = message.copy()
        
        # Descifrar el role del mensaje
        if 'role' in decrypted_message and decrypted_message['role']:
            try:
                # Verificar si el role parece estar cifrado (base64)
                if len(decrypted_message['role']) > 20:  # Los roles normales son cortos
                    decrypted_message['role'] = decrypt_data(decrypted_message['role'])
            except Exception as e:
                print(f"Error al descifrar role del mensaje: {e}")
        
        # Descifrar el contenido del mensaje
        if 'content' in decrypted_message and decrypted_message['content']:
            try:
                decrypted_message['content'] = decrypt_data(decrypted_message['content'])
            except Exception as e:
                print(f"Error al descifrar contenido del mensaje: {e}")
        
        # Descifrar metadata si es string cifrado
        if 'metadata' in decrypted_message and isinstance(decrypted_message['metadata'], str):
            try:
                import json
                metadata_json = decrypt_data(decrypted_message['metadata'])
                decrypted_message['metadata'] = json.loads(metadata_json)
            except Exception as e:
                print(f"Error al descifrar metadata: {e}")
                # Si falla, intentar usar como esta
                if isinstance(decrypted_message.get('metadata'), str):
                    decrypted_message['metadata'] = {}
        
        return decrypted_message
    
    def _encrypt_conversation_title(self, title: str) -> str:
        """
        Cifra el titulo de una conversacion
        
        Args:
            title: Titulo en texto plano
        
        Returns:
            Titulo cifrado
        """
        try:
            return encrypt_data(title)
        except Exception as e:
            print(f"Error al cifrar titulo: {e}")
            return title
    
    def _decrypt_conversation_title(self, encrypted_title: str) -> str:
        """
        Descifra el titulo de una conversacion
        
        Args:
            encrypted_title: Titulo cifrado
        
        Returns:
            Titulo en texto plano
        """
        try:
            # Verificar si parece estar cifrado (base64)
            if len(encrypted_title) > 50 or '=' in encrypted_title:
                return decrypt_data(encrypted_title)
            return encrypted_title
        except Exception as e:
            print(f"Error al descifrar titulo: {e}")
            return encrypted_title
    
    def _encrypt_sensitive_data(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        DEPRECADO: Usar _encrypt_message en su lugar
        Cifra datos sensibles en metadata
        
        Args:
            metadata: Diccionario con metadata del mensaje
        
        Returns:
            Diccionario con datos sensibles cifrados
        """
        if not metadata:
            return {}
        
        encrypted_metadata = metadata.copy()
        
        # Cifrar datos personales si existen
        if 'personal_data' in encrypted_metadata and encrypted_metadata['personal_data']:
            encrypted_personal = {}
            for key, value in encrypted_metadata['personal_data'].items():
                if value and isinstance(value, str):
                    try:
                        encrypted_personal[key] = encrypt_data(value)
                    except Exception as e:
                        print(f"Error al cifrar {key}: {e}")
                        encrypted_personal[key] = value
                else:
                    encrypted_personal[key] = value
            encrypted_metadata['personal_data'] = encrypted_personal
            encrypted_metadata['encrypted'] = True
        
        return encrypted_metadata
    
    def _decrypt_sensitive_data(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Descifra datos sensibles en metadata
        
        Args:
            metadata: Diccionario con metadata cifrada
        
        Returns:
            Diccionario con datos descifrados
        """
        if not metadata or not metadata.get('encrypted', False):
            return metadata
        
        decrypted_metadata = metadata.copy()
        
        # Descifrar datos personales si existen
        if 'personal_data' in decrypted_metadata and decrypted_metadata['personal_data']:
            decrypted_personal = {}
            for key, value in decrypted_metadata['personal_data'].items():
                if value and isinstance(value, str):
                    try:
                        decrypted_personal[key] = decrypt_data(value)
                    except Exception as e:
                        print(f"Error al descifrar {key}: {e}")
                        decrypted_personal[key] = value
                else:
                    decrypted_personal[key] = value
            decrypted_metadata['personal_data'] = decrypted_personal
        
        return decrypted_metadata
    
    def create_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        """
        Crear una nueva conversacion
        
        Args:
            title: Titulo de la conversacion (opcional)
        
        Returns:
            Diccionario con los datos de la conversacion creada (con titulo descifrado)
        """
        conversation_id = str(uuid4())
        timestamp = datetime.now().isoformat()
        
        plain_title = title or f"Conversacion {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        conversation = {
            "id": conversation_id,
            "title": plain_title,
            "created_at": timestamp,
            "updated_at": timestamp,
            "messages": []
        }
        
        # Guardar conversacion (cifrara el titulo automaticamente)
        self._save_conversation(conversation)
        
        # Actualizar indice (guardar titulo en texto plano en el indice para busquedas)
        index = self._load_index()
        index.append({
            "id": conversation_id,
            "title": plain_title,
            "created_at": timestamp,
            "updated_at": timestamp,
            "message_count": 0
        })
        self._save_index(index)
        
        # Retornar con titulo en texto plano
        return conversation
    
    def _save_conversation(self, conversation: Dict[str, Any], encrypt_messages: bool = True):
        """
        Guardar una conversacion en disco
        
        Args:
            conversation: Datos de la conversacion
            encrypt_messages: Si True, cifra todos los mensajes Y el titulo antes de guardar
        """
        conversation_file = self._get_conversation_file(conversation["id"])
        try:
            # Crear copia para no modificar el original
            conv_to_save = conversation.copy()
            
            # Cifrar el titulo si se requiere
            if encrypt_messages and conv_to_save.get('title'):
                conv_to_save['title'] = self._encrypt_conversation_title(conv_to_save['title'])
                conv_to_save['title_encrypted'] = True
            
            # Cifrar todos los mensajes si se requiere
            if encrypt_messages and conv_to_save.get('messages'):
                encrypted_messages = []
                for message in conv_to_save['messages']:
                    # Solo cifrar si no esta ya cifrado
                    if not message.get('encrypted', False):
                        encrypted_messages.append(self._encrypt_message(message))
                    else:
                        encrypted_messages.append(message)
                conv_to_save['messages'] = encrypted_messages
            
            with open(conversation_file, 'w', encoding='utf-8') as f:
                json.dump(conv_to_save, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error al guardar conversacion {conversation['id']}: {e}")
            raise
    
    def get_conversation(self, conversation_id: str, decrypt_messages=True) -> Optional[Dict[str, Any]]:
        """
        Obtener una conversacion por su ID
        
        Args:
            conversation_id: ID de la conversacion
            decrypt_messages: Si True, descifra todos los mensajes Y el titulo
        
        Returns:
            Diccionario con los datos de la conversacion o None si no existe
        """
        conversation_file = self._get_conversation_file(conversation_id)
        
        if not conversation_file.exists():
            return None
        
        try:
            with open(conversation_file, 'r', encoding='utf-8') as f:
                conversation = json.load(f)
            
            # Descifrar el titulo si es necesario
            if decrypt_messages and conversation.get('title_encrypted', False):
                conversation['title'] = self._decrypt_conversation_title(conversation['title'])
            
            # Descifrar todos los mensajes si es necesario
            if decrypt_messages and conversation.get('messages'):
                decrypted_messages = []
                for message in conversation['messages']:
                    if message.get('encrypted', False):
                        decrypted_messages.append(self._decrypt_message(message))
                    else:
                        decrypted_messages.append(message)
                conversation['messages'] = decrypted_messages
            
            return conversation
        except Exception as e:
            print(f"Error al cargar conversacion {conversation_id}: {e}")
            return None
    
    def list_conversations(
        self,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Listar todas las conversaciones (ordenadas por actualizacion)
        
        Args:
            limit: Numero maximo de conversaciones a retornar
            offset: Numero de conversaciones a saltar
        
        Returns:
            Lista de metadatos de conversaciones
        """
        index = self._load_index()
        
        # Ordenar por fecha de actualizacion (mas recientes primero)
        index.sort(key=lambda x: x["updated_at"], reverse=True)
        
        # Aplicar paginacion
        if limit:
            return index[offset:offset + limit]
        return index[offset:]
    
    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        encrypt_sensitive: bool = True
    ) -> bool:
        """
        Agregar un mensaje a una conversacion
        
        **NOTA**: TODOS los mensajes se cifran automaticamente antes de guardar,
        incluyendo el contenido y la metadata completa.
        
        Args:
            conversation_id: ID de la conversacion
            role: Rol del mensaje ('user' o 'assistant')
            content: Contenido del mensaje
            metadata: Metadata adicional (fuentes, datos personales, etc.)
            encrypt_sensitive: DEPRECADO - Siempre se cifra todo
        
        Returns:
            True si se agrego exitosamente, False en caso contrario
        """
        # Cargar conversacion SIN descifrar (para no descifrar y recifrar innecesariamente)
        conversation = self.get_conversation(conversation_id, decrypt_messages=False)
        
        if not conversation:
            print(f"Conversacion {conversation_id} no encontrada")
            return False
        
        # Crear mensaje sin cifrar (se cifrara al guardar)
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {}
        }
        
        conversation["messages"].append(message)
        conversation["updated_at"] = datetime.now().isoformat()
        
        # Guardar conversacion actualizada
        self._save_conversation(conversation)
        
        # Actualizar indice
        index = self._load_index()
        for entry in index:
            if entry["id"] == conversation_id:
                entry["updated_at"] = conversation["updated_at"]
                entry["message_count"] = len(conversation["messages"])
                # Actualizar titulo si es el primer mensaje del usuario
                if len(conversation["messages"]) == 1 and role == "user":
                    # Generar titulo a partir de los primeros 50 caracteres
                    auto_title = content[:50] + ("..." if len(content) > 50 else "")
                    entry["title"] = auto_title
                    conversation["title"] = auto_title
                    self._save_conversation(conversation)
                break
        self._save_index(index)
        
        return True
    
    def delete_conversation(self, conversation_id: str) -> bool:
        """
        Eliminar una conversacion
        
        Args:
            conversation_id: ID de la conversacion a eliminar
        
        Returns:
            True si se elimino exitosamente, False en caso contrario
        """
        conversation_file = self._get_conversation_file(conversation_id)
        
        if not conversation_file.exists():
            return False
        
        try:
            # Eliminar archivo
            conversation_file.unlink()
            
            # Actualizar indice
            index = self._load_index()
            index = [entry for entry in index if entry["id"] != conversation_id]
            self._save_index(index)
            
            return True
        except Exception as e:
            print(f"Error al eliminar conversacion {conversation_id}: {e}")
            return False
    
    def update_conversation_title(self, conversation_id: str, new_title: str) -> bool:
        """
        Actualizar el titulo de una conversacion
        
        Args:
            conversation_id: ID de la conversacion
            new_title: Nuevo titulo
        
        Returns:
            True si se actualizo exitosamente, False en caso contrario
        """
        conversation = self.get_conversation(conversation_id)
        
        if not conversation:
            return False
        
        conversation["title"] = new_title
        conversation["updated_at"] = datetime.now().isoformat()
        
        # Guardar conversacion
        self._save_conversation(conversation)
        
        # Actualizar indice
        index = self._load_index()
        for entry in index:
            if entry["id"] == conversation_id:
                entry["title"] = new_title
                entry["updated_at"] = conversation["updated_at"]
                break
        self._save_index(index)
        
        return True
    
    def get_conversation_history(
        self,
        conversation_id: str,
        max_messages: Optional[int] = None,
        decrypt_messages: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Obtener el historial de mensajes de una conversacion
        
        **NOTA**: Los mensajes se descifran automaticamente si decrypt_messages=True
        
        Args:
            conversation_id: ID de la conversacion
            max_messages: Numero maximo de mensajes a retornar (ultimos N)
            decrypt_messages: Si True, descifra todos los mensajes
        
        Returns:
            Lista de mensajes ordenados cronologicamente
        """
        conversation = self.get_conversation(conversation_id, decrypt_messages=decrypt_messages)
        
        if not conversation:
            return []
        
        messages = conversation["messages"]
        
        if max_messages:
            return messages[-max_messages:]
        
        return messages
    
    def clear_conversation(self, conversation_id: str) -> bool:
        """
        Limpiar todos los mensajes de una conversacion
        
        Args:
            conversation_id: ID de la conversacion
        
        Returns:
            True si se limpio exitosamente, False en caso contrario
        """
        conversation = self.get_conversation(conversation_id)
        
        if not conversation:
            return False
        
        conversation["messages"] = []
        conversation["updated_at"] = datetime.now().isoformat()
        
        # Guardar conversacion
        self._save_conversation(conversation)
        
        # Actualizar indice
        index = self._load_index()
        for entry in index:
            if entry["id"] == conversation_id:
                entry["updated_at"] = conversation["updated_at"]
                entry["message_count"] = 0
                break
        self._save_index(index)
        
        return True
    
    def search_conversations(self, query: str) -> List[Dict[str, Any]]:
        """
        Buscar conversaciones por titulo o contenido
        
        Args:
            query: Termino de busqueda
        
        Returns:
            Lista de conversaciones que coinciden con la busqueda
        """
        query_lower = query.lower()
        results = []
        
        index = self._load_index()
        
        for entry in index:
            # Buscar en titulo
            if query_lower in entry["title"].lower():
                results.append(entry)
                continue
            
            # Buscar en contenido de mensajes
            conversation = self.get_conversation(entry["id"])
            if conversation:
                for message in conversation["messages"]:
                    if query_lower in message["content"].lower():
                        results.append(entry)
                        break
        
        # Ordenar por actualizacion
        results.sort(key=lambda x: x["updated_at"], reverse=True)
        
        return results


# Instancia global singleton
_conversation_manager: Optional[ConversationManager] = None


def get_conversation_manager(conversations_dir: str = "./conversations") -> ConversationManager:
    """
    Obtener la instancia singleton del gestor de conversaciones
    
    Args:
        conversations_dir: Directorio donde se guardaran las conversaciones
    
    Returns:
        Instancia del ConversationManager
    """
    global _conversation_manager
    
    if _conversation_manager is None:
        _conversation_manager = ConversationManager(conversations_dir)
    
    return _conversation_manager
