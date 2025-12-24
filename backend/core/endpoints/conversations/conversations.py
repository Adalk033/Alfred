# ============================================================================
# ENDPOINTS DE CONVERSACIONES
# ============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from conversation_manager import get_conversation_manager
from utils.logger import get_logger
from utils.security import decrypt_data
from functionsToHistory import encrypt_personal_data, decrypt_personal_data
import functionsToHistory
import config

from endpoints.shared_state import get_alfred_core_instance, is_alfred_core_initialized

# Importar funciones de extraccion de texto desde alfred_backend
# (estas funciones deberian estar en un modulo separado, pero por ahora las importamos asi)
import sys
from pathlib import Path
backend_core = Path(__file__).parent.parent
sys.path.insert(0, str(backend_core))

# Importar funciones de utilidad para procesamiento de archivos
# Las importamos dinamicamente para evitar dependencias circulares
def get_file_extractors():
    """Importar funciones de extraccion de archivos dinamicamente"""
    import alfred_backend
    return {
        'pdf': alfred_backend.extract_text_from_pdf,
        'docx': alfred_backend.extract_text_from_docx,
        'xlsx': alfred_backend.extract_text_from_xlsx,
        'pptx': alfred_backend.extract_text_from_pptx
    }

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("conversations")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class ConversationMessage(BaseModel):
    """Mensaje dentro de una conversacion"""
    role: str = Field(..., description="Rol del mensaje: 'user' o 'assistant'")
    content: str = Field(..., description="Contenido del mensaje")
    timestamp: str = Field(..., description="Timestamp del mensaje")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")

class ConversationDetail(BaseModel):
    """Detalle completo de una conversacion"""
    id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ConversationMessage]

class ConversationSummary(BaseModel):
    """Resumen de una conversacion para listados"""
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int

class CreateConversationRequest(BaseModel):
    """Solicitud para crear una nueva conversacion"""
    title: Optional[str] = Field(None, description="Titulo de la conversacion (opcional)")

class AddMessageRequest(BaseModel):
    """Solicitud para agregar un mensaje a una conversacion"""
    conversation_id: str = Field(..., description="ID de la conversacion")
    role: str = Field(..., description="Rol del mensaje: 'user' o 'assistant'")
    content: str = Field(..., description="Contenido del mensaje")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Metadata adicional")

class UpdateTitleRequest(BaseModel):
    """Solicitud para actualizar el titulo de una conversacion"""
    title: str = Field(..., description="Nuevo titulo", min_length=1)

class QueryWithConversationRequest(BaseModel):
    """Solicitud de consulta con historial de conversacion"""
    question: str = Field(..., description="Pregunta del usuario", min_length=1)
    conversation_id: Optional[str] = Field(None, description="ID de la conversacion activa")
    use_history: bool = Field(True, description="Buscar primero en el historial Q&A")
    save_response: bool = Field(False, description="Guardar respuesta en historial Q&A")
    search_documents: bool = Field(True, description="Buscar en documentos o solo usar el prompt")
    search_kwargs: Optional[Dict[str, Any]] = Field(None, description="Parametros adicionales de busqueda")
    max_context_messages: int = Field(50, description="Numero maximo de mensajes de contexto", ge=1, le=50)
    temp_document: Optional[Dict[str, str]] = Field(None, description="Documento temporal adjunto (name, content)")

class QueryResponse(BaseModel):
    """Respuesta del asistente"""
    answer: str = Field(..., description="Respuesta generada por Alfred")
    personal_data: Optional[Dict[str, str]] = Field(None, description="Datos personales extraidos")
    sources: List[str] = Field(default_factory=list, description="Fuentes de los documentos")
    from_history: bool = Field(False, description="Si la respuesta proviene del historial")
    history_score: Optional[float] = Field(None, description="Score de similitud con historial")
    timestamp: str = Field(default_factory=lambda: __import__('datetime').datetime.now().isoformat())
    context_count: int = Field(0, description="Numero de fragmentos recuperados")
    from_cache: Optional[bool] = Field(None, description="Si la respuesta proviene del cache en memoria")
    cache_age_seconds: Optional[float] = Field(None, description="Edad del cache en segundos")

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def ensure_personal_data_decrypted(data: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """Asegura que los datos personales esten descifrados"""
    if not data:
        return None
    
    try:
        decrypted = {}
        for key, value in data.items():
            if isinstance(value, str) and value.startswith('gAAAAAB'):
                try:
                    decrypted[key] = decrypt_data(value)
                except:
                    decrypted[key] = value
            else:
                decrypted[key] = value
        return decrypted
    except Exception as e:
        backend_logger.error(f"Error al descifrar datos personales: {e}")
        return data

def log_personal_data_access(operation: str, data_keys: List[str], user_context: str = "API"):
    """Registra el acceso a datos personales para auditoria"""
    from datetime import datetime
    backend_logger.info(
        f"Acceso a datos personales: {operation} | "
        f"Campos: {', '.join(data_keys)} | "
        f"Contexto: {user_context} | "
        f"Timestamp: {datetime.now().isoformat()}"
    )

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/conversations", response_model=ConversationDetail, tags=["Conversaciones"])
async def create_conversation(request: CreateConversationRequest):
    """
    Crear una nueva conversacion
    
    - **title**: Titulo opcional de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        conversation = conv_mgr.create_conversation(title=request.title)
        
        return ConversationDetail(
            id=conversation["id"],
            title=conversation["title"],
            created_at=conversation["created_at"],
            updated_at=conversation["updated_at"],
            messages=[]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear conversacion: {str(e)}")

@router.get("/conversations", response_model=List[ConversationSummary], tags=["Conversaciones"])
async def list_conversations(limit: Optional[int] = None, offset: int = 0):
    """
    Listar todas las conversaciones
    
    - **limit**: Numero maximo de conversaciones a retornar
    - **offset**: Numero de conversaciones a saltar
    """
    try:
        conv_mgr = get_conversation_manager()
        conversations = conv_mgr.list_conversations(limit=limit, offset=offset)
        
        return [
            ConversationSummary(
                id=conv["id"],
                title=conv["title"],
                created_at=conv["created_at"],
                updated_at=conv["updated_at"],
                message_count=conv["message_count"]
            )
            for conv in conversations
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar conversaciones: {str(e)}")

@router.get("/conversations/{conversation_id}", response_model=ConversationDetail, tags=["Conversaciones"])
async def get_conversation(conversation_id: str):
    """
    Obtener una conversacion por su ID
    
    - **conversation_id**: ID de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        conversation = conv_mgr.get_conversation(conversation_id)
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return ConversationDetail(
            id=conversation["id"],
            title=conversation["title"],
            created_at=conversation["created_at"],
            updated_at=conversation["updated_at"],
            messages=[
                ConversationMessage(**msg)
                for msg in conversation["messages"]
            ]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener conversacion: {str(e)}")

@router.post("/conversations/{conversation_id}/messages", tags=["Conversaciones"])
async def add_message_to_conversation(conversation_id: str, request: AddMessageRequest):
    """
    Agregar un mensaje a una conversacion
    
    - **conversation_id**: ID de la conversacion
    - **role**: Rol del mensaje ('user' o 'assistant')
    - **content**: Contenido del mensaje
    - **metadata**: Metadata adicional (opcional)
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.add_message(
            conversation_id=conversation_id,
            role=request.role,
            content=request.content,
            metadata=request.metadata
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Mensaje agregado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al agregar mensaje: {str(e)}")

@router.delete("/conversations/{conversation_id}", tags=["Conversaciones"])
async def delete_conversation(conversation_id: str):
    """
    Eliminar una conversacion
    
    - **conversation_id**: ID de la conversacion a eliminar
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.delete_conversation(conversation_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Conversacion eliminada exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar conversacion: {str(e)}")

@router.put("/conversations/{conversation_id}/title", tags=["Conversaciones"])
async def update_conversation_title(conversation_id: str, request: UpdateTitleRequest):
    """
    Actualizar el titulo de una conversacion
    
    - **conversation_id**: ID de la conversacion
    - **title**: Nuevo titulo
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.update_conversation_title(conversation_id, request.title)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Titulo actualizado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar titulo: {str(e)}")

@router.delete("/conversations/{conversation_id}/messages", tags=["Conversaciones"])
async def clear_conversation(conversation_id: str):
    """
    Limpiar todos los mensajes de una conversacion
    
    - **conversation_id**: ID de la conversacion
    """
    try:
        conv_mgr = get_conversation_manager()
        success = conv_mgr.clear_conversation(conversation_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversacion no encontrada")
        
        return {"status": "success", "message": "Conversacion limpiada exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al limpiar conversacion: {str(e)}")

@router.get("/conversations/search/{query}", response_model=List[ConversationSummary], tags=["Conversaciones"])
async def search_conversations(query: str):
    """
    Buscar conversaciones por titulo o contenido
    
    - **query**: Termino de busqueda
    """
    try:
        conv_mgr = get_conversation_manager()
        results = conv_mgr.search_conversations(query)
        
        return [
            ConversationSummary(
                id=conv["id"],
                title=conv["title"],
                created_at=conv["created_at"],
                updated_at=conv["updated_at"],
                message_count=conv["message_count"]
            )
            for conv in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar conversaciones: {str(e)}")

@router.post("/query/conversation", response_model=QueryResponse, tags=["Consultas"])
async def query_with_conversation(request: QueryWithConversationRequest):
    """
    Realizar una consulta a Alfred con contexto de conversacion
    
    **NOTA DE SEGURIDAD**: Los datos personales en metadata se cifran automaticamente al guardar
    en la conversacion y se descifran al leerlos.
    
    **CIFRADO END-TO-END**: Las preguntas pueden venir cifradas desde el frontend y se descifran
    aqui antes de procesarlas.
    
    - **question**: Pregunta del usuario (puede estar cifrada con Fernet)
    - **conversation_id**: ID de la conversacion activa (opcional)
    - **use_history**: Buscar primero en el historial Q&A
    - **save_response**: Guardar respuesta en historial Q&A (con cifrado)
    - **search_documents**: Buscar en documentos o solo usar el prompt
    - **max_context_messages**: Numero maximo de mensajes de contexto
    """
    alfred_core = get_alfred_core_instance()
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        # DESCIFRAR PREGUNTA SI VIENE CIFRADA (End-to-End Encryption)
        question = request.question
        was_encrypted = False
        
        if question and question.startswith('gAAAAAB'):
            # La pregunta viene cifrada, descifrarla
            backend_logger.info(f"🔓 Pregunta cifrada detectada (conversacion), descifrando...")
            try:
                question = decrypt_data(question)
                was_encrypted = True
                backend_logger.info(f"✅ Pregunta descifrada correctamente: {question[:50]}...")
            except Exception as decrypt_error:
                backend_logger.error(f"❌ Error al descifrar pregunta: {decrypt_error}")
                raise HTTPException(
                    status_code=400, 
                    detail="Error al descifrar la pregunta. Verifica que el cifrado este configurado correctamente."
                )
        
        print(f"Procesando consulta con conversacion {'(descifrada)' if was_encrypted else ''}: {question[:50]}...")
        
        # Obtener historial de conversacion si existe (descifra automaticamente)
        conversation_history = None
        if request.conversation_id:
            conv_mgr = get_conversation_manager()
            messages = conv_mgr.get_conversation_history(
                request.conversation_id,
                max_messages=request.max_context_messages,
                decrypt_messages=True  # Cambiado de decrypt_sensitive a decrypt_messages
            )
            conversation_history = [
                {"role": msg["role"], "content": msg["content"]}
                for msg in messages
            ]
        
        # Si hay documento temporal adjunto, agregarlo al contexto de la pregunta
        question_with_context = question  # Usar pregunta descifrada
        force_prompt_only = False
        
        if request.temp_document:
            file_name = request.temp_document['name']
            print(f"📎 Documento temporal adjunto: {file_name}")
            
            # Obtener funciones de extraccion
            extractors = get_file_extractors()
            
            # Detectar formato y procesar segun extension
            file_ext = file_name.lower()
            
            if file_ext.endswith('.pdf'):
                print(f"📄 Procesando PDF...")
                doc_content = extractors['pdf'](request.temp_document['content'], file_name)
            elif file_ext.endswith('.docx'):
                print(f"📄 Procesando Word (DOCX)...")
                doc_content = extractors['docx'](request.temp_document['content'], file_name)
            elif file_ext.endswith('.xlsx'):
                print(f"📊 Procesando Excel (XLSX)...")
                doc_content = extractors['xlsx'](request.temp_document['content'], file_name)
            elif file_ext.endswith('.pptx'):
                print(f"📊 Procesando PowerPoint (PPTX)...")
                doc_content = extractors['pptx'](request.temp_document['content'], file_name)
            else:
                # Archivos de texto plano (txt, md, json, xml, csv, etc)
                doc_content = request.temp_document['content']
            
            # Obtener tamaño
            doc_size_kb = len(doc_content.encode('utf-8')) / 1024
            
            print(f"📊 Tamaño del documento: {doc_size_kb:.2f} KB")
            
            # Si el documento es muy grande (>100KB), truncar o advertir
            max_chars = 50000  # ~50KB de texto (aprox 12,500 palabras)
            if len(doc_content) > max_chars:
                print(f"⚠️ Documento grande ({len(doc_content)} chars), truncando a {max_chars} chars")
                doc_content = doc_content[:max_chars] + "\n\n[... documento truncado por tamaño ...]"
            
            # Forzar modo prompt-only cuando hay documento adjunto (más rápido)
            force_prompt_only = True
            print(f"🚀 Modo prompt-only forzado para archivo adjunto")
            
            # Agregar documento al contexto
            document_context = f"\n\n--- DOCUMENTO ADJUNTO: {file_name} ---\n"
            document_context += doc_content
            document_context += f"\n--- FIN DEL DOCUMENTO ---\n\n"
            question_with_context = document_context + question  # Usar pregunta descifrada
        
        # Ejecutar consulta con contexto de conversacion
        # Si hay documento adjunto, forzar search_documents=False para mejor rendimiento
        result = await alfred_core.query_async(
            question=question_with_context,
            use_history=request.use_history,
            search_documents=request.search_documents if not force_prompt_only else False,
            search_kwargs=request.search_kwargs,
            conversation_history=conversation_history
        )
        
        print(f"Consulta procesada exitosamente")
        
        # Asegurar que los datos personales esten descifrados
        personal_data = ensure_personal_data_decrypted(result.get('personal_data'))
        
        # Registrar acceso a datos personales si existen
        if personal_data:
            log_personal_data_access(
                operation="read",
                data_keys=list(personal_data.keys()),
                user_context=f"Query con conversacion: {request.conversation_id}"
            )
        
        # Agregar mensajes a la conversacion si existe
        if request.conversation_id:
            conv_mgr = get_conversation_manager()
            # Agregar pregunta del usuario (ya descifrada)
            conv_mgr.add_message(
                conversation_id=request.conversation_id,
                role="user",
                content=question,  # Usar pregunta descifrada
                metadata={},
                encrypt_sensitive=False  # No hay datos sensibles en pregunta
            )
            # Agregar respuesta del asistente (cifra automaticamente metadata)
            conv_mgr.add_message(
                conversation_id=request.conversation_id,
                role="assistant",
                content=result['answer'],
                metadata={
                    "sources": result.get('sources', []),
                    "personal_data": personal_data,
                    "from_history": result.get('from_history', False)
                },
                encrypt_sensitive=True  # Cifrar datos sensibles en metadata
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context=f"Guardado en conversacion: {request.conversation_id}"
                )
        
        # Guardar en historial Q&A si se solicita (cifra automaticamente)
        if request.save_response and not result.get('from_history', False):
            functionsToHistory.save_qa_to_history(
                question=question,  # Usar pregunta descifrada
                answer=result['answer'],
                personal_data=personal_data,
                sources=result.get('sources', []),
                encrypt_sensitive=True
            )
            
            if personal_data:
                log_personal_data_access(
                    operation="write",
                    data_keys=list(personal_data.keys()),
                    user_context="Guardado en historial Q&A desde conversacion"
                )
        
        return QueryResponse(
            answer=result['answer'],
            personal_data=personal_data,
            sources=result.get('sources', []),
            from_history=result.get('from_history', False),
            history_score=result.get('history_score'),
            context_count=result.get('context_count', 0)
        )
    
    except Exception as e:
        # Sanitizar el mensaje de error
        error_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        if not error_msg:
            error_msg = "Error desconocido al procesar la consulta"
        
        print(f"Error al procesar consulta: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error al procesar consulta: {error_msg}")
