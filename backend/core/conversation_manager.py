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
    
    def _load_index(self) -> List[Dict[str, Any]]:
        """Cargar el indice de conversaciones"""
        try:
            with open(self.index_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error al cargar indice: {e}")
            return []
    
    def _save_index(self, index: List[Dict[str, Any]]):
        """Guardar el indice de conversaciones"""
        try:
            with open(self.index_file, 'w', encoding='utf-8') as f:
                json.dump(index, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error al guardar indice: {e}")
    
    def _get_conversation_file(self, conversation_id: str) -> Path:
        """Obtener la ruta del archivo de una conversacion"""
        return self.conversations_dir / f"{conversation_id}.json"
    
    def create_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        """
        Crear una nueva conversacion
        
        Args:
            title: Titulo de la conversacion (opcional)
        
        Returns:
            Diccionario con los datos de la conversacion creada
        """
        conversation_id = str(uuid4())
        timestamp = datetime.now().isoformat()
        
        conversation = {
            "id": conversation_id,
            "title": title or f"Conversacion {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "created_at": timestamp,
            "updated_at": timestamp,
            "messages": []
        }
        
        # Guardar conversacion
        self._save_conversation(conversation)
        
        # Actualizar indice
        index = self._load_index()
        index.append({
            "id": conversation_id,
            "title": conversation["title"],
            "created_at": timestamp,
            "updated_at": timestamp,
            "message_count": 0
        })
        self._save_index(index)
        
        return conversation
    
    def _save_conversation(self, conversation: Dict[str, Any]):
        """Guardar una conversacion en disco"""
        conversation_file = self._get_conversation_file(conversation["id"])
        try:
            with open(conversation_file, 'w', encoding='utf-8') as f:
                json.dump(conversation, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error al guardar conversacion {conversation['id']}: {e}")
            raise
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        Obtener una conversacion por su ID
        
        Args:
            conversation_id: ID de la conversacion
        
        Returns:
            Diccionario con los datos de la conversacion o None si no existe
        """
        conversation_file = self._get_conversation_file(conversation_id)
        
        if not conversation_file.exists():
            return None
        
        try:
            with open(conversation_file, 'r', encoding='utf-8') as f:
                return json.load(f)
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
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Agregar un mensaje a una conversacion
        
        Args:
            conversation_id: ID de la conversacion
            role: Rol del mensaje ('user' o 'assistant')
            content: Contenido del mensaje
            metadata: Metadata adicional (fuentes, datos personales, etc.)
        
        Returns:
            True si se agrego exitosamente, False en caso contrario
        """
        conversation = self.get_conversation(conversation_id)
        
        if not conversation:
            print(f"Conversacion {conversation_id} no encontrada")
            return False
        
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
        max_messages: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtener el historial de mensajes de una conversacion
        
        Args:
            conversation_id: ID de la conversacion
            max_messages: Numero maximo de mensajes a retornar (ultimos N)
        
        Returns:
            Lista de mensajes ordenados cronologicamente
        """
        conversation = self.get_conversation(conversation_id)
        
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
