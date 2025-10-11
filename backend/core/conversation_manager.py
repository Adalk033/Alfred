"""
Conversation Manager - Sistema de gestion de conversaciones
Ahora usa SQLite cifrado en lugar de JSON
Mantiene compatibilidad de API con el sistema anterior
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from uuid import uuid4
from utils.security import encrypt_data, decrypt_data

# Importar funciones de base de datos
from db_manager import (
    create_conversation as db_create_conversation,
    add_message_to_conversation as db_add_message,
    get_conversation as db_get_conversation,
    list_conversations as db_list_conversations,
    update_conversation_title as db_update_title,
    delete_conversation as db_delete_conversation,
    clear_conversation_messages as db_clear_messages,
    search_conversations as db_search_conversations,
    get_conversation_stats
)


class ConversationManager:
    """Gestor de conversaciones de Alfred - Ahora usa SQLite cifrado"""
    
    def __init__(self, conversations_dir: str = "./conversations"):
        """
        Inicializar el gestor de conversaciones
        
        Args:
            conversations_dir: (OBSOLETO) Se mantiene por compatibilidad pero ya no se usa
        """
        # Ya no usamos el directorio, pero lo mantenemos por compatibilidad
        self.conversations_dir = Path(conversations_dir)
        # No crear el directorio ni archivos JSON
    
    def create_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        """
        Crear una nueva conversacion (ahora usa SQLite cifrado)
        
        Args:
            title: Titulo de la conversacion (opcional)
        
        Returns:
            Diccionario con los datos de la conversacion creada
        """
        conversation_id = str(uuid4())
        plain_title = title or f"Conversacion {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        # Crear en base de datos (se cifra automaticamente)
        result = db_create_conversation(conversation_id, plain_title)
        
        if result:
            # Retornar la conversacion recien creada
            return {
                "id": conversation_id,
                "title": plain_title,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "messages": []
            }
        else:
            raise Exception("Error al crear conversacion en base de datos")
    
    def get_conversation(self, conversation_id: str, decrypt_messages=True) -> Optional[Dict[str, Any]]:
        """
        Obtener una conversacion por su ID (ahora usa SQLite cifrado)
        
        Args:
            conversation_id: ID de la conversacion
            decrypt_messages: (Ignorado, siempre descifra - se mantiene por compatibilidad)
        
        Returns:
            Diccionario con los datos de la conversacion descifrados o None si no existe
        """
        return db_get_conversation(conversation_id)
    
    def list_conversations(
        self,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Listar todas las conversaciones (ahora usa SQLite cifrado)
        
        Args:
            limit: Numero maximo de conversaciones a retornar
            offset: Numero de conversaciones a saltar
        
        Returns:
            Lista de metadatos de conversaciones descifradas
        """
        return db_list_conversations(limit, offset)
    
    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        encrypt_sensitive: bool = True
    ) -> bool:
        """
        Agregar un mensaje a una conversacion (ahora usa SQLite cifrado)
        TODOS los campos se cifran automaticamente
        
        Args:
            conversation_id: ID de la conversacion
            role: Rol del mensaje (user/assistant)
            content: Contenido del mensaje
            metadata: Metadata adicional (opcional)
            encrypt_sensitive: (Ignorado, siempre cifra - se mantiene por compatibilidad)
        
        Returns:
            True si se agrego exitosamente, False en caso contrario
        """
        timestamp = datetime.now().isoformat()
        
        # Agregar a base de datos (se cifra automaticamente)
        message_id = db_add_message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            timestamp=timestamp,
            metadata=metadata or {}
        )
        
        return message_id is not None
    
    def update_conversation_title(self, conversation_id: str, new_title: str) -> bool:
        """
        Actualizar el titulo de una conversacion (ahora usa SQLite cifrado)
        
        Args:
            conversation_id: ID de la conversacion
            new_title: Nuevo titulo (se cifra automaticamente)
        
        Returns:
            True si se actualizo exitosamente, False en caso contrario
        """
        return db_update_title(conversation_id, new_title)
    
    def get_conversation_history(
        self,
        conversation_id: str,
        max_messages: Optional[int] = None,
        decrypt_messages: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Obtener el historial de mensajes de una conversacion (ahora usa SQLite cifrado)
        
        Args:
            conversation_id: ID de la conversacion
            max_messages: Numero maximo de mensajes a retornar (ultimos N)
            decrypt_messages: (Ignorado, siempre descifra - se mantiene por compatibilidad)
        
        Returns:
            Lista de mensajes ordenados cronologicamente descifrados
        """
        conversation = db_get_conversation(conversation_id)
        
        if not conversation:
            return []
        
        messages = conversation.get("messages", [])
        
        if max_messages:
            return messages[-max_messages:]
        
        return messages
    
    def clear_conversation(self, conversation_id: str) -> bool:
        """
        Limpiar todos los mensajes de una conversacion (ahora usa SQLite cifrado)
        
        Args:
            conversation_id: ID de la conversacion
        
        Returns:
            True si se limpio exitosamente, False en caso contrario
        """
        return db_clear_messages(conversation_id)
    
    def search_conversations(self, query: str) -> List[Dict[str, Any]]:
        """
        Buscar conversaciones por titulo (ahora usa SQLite cifrado)
        
        Args:
            query: Termino de busqueda
        
        Returns:
            Lista de conversaciones que coinciden con la busqueda
        """
        return db_search_conversations(query)
    
    def delete_conversation(self, conversation_id: str) -> bool:
        """
        Eliminar una conversacion completa (ahora usa SQLite cifrado)
        
        Args:
            conversation_id: ID de la conversacion a eliminar
        
        Returns:
            True si se elimino exitosamente, False en caso contrario
        """
        return db_delete_conversation(conversation_id)


# Instancia global singleton
_conversation_manager: Optional[ConversationManager] = None


def get_conversation_manager(conversations_dir: str = "./conversations") -> ConversationManager:
    """
    Obtener la instancia singleton del gestor de conversaciones
    
    Args:
        conversations_dir: (OBSOLETO) Se mantiene por compatibilidad
    
    Returns:
        Instancia del gestor de conversaciones
    """
    global _conversation_manager
    
    if _conversation_manager is None:
        _conversation_manager = ConversationManager(conversations_dir)
    
    return _conversation_manager
