# ============================================================
# ENDPOINTS DE GESTION DE RUTAS DE DOCUMENTOS
# ============================================================

from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import asyncio
import json
import os
import gc
from utils.logger import get_logger
from endpoints.shared_state import get_alfred_core_instance, is_alfred_core_initialized

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("documents")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class DocumentPathCreate(BaseModel):
    """Solicitud para agregar una ruta de documentos"""
    path: str = Field(..., description="Ruta absoluta del directorio")

class DocumentPathUpdate(BaseModel):
    """Solicitud para actualizar una ruta de documentos"""
    new_path: Optional[str] = Field(None, description="Nueva ruta absoluta")
    enabled: Optional[bool] = Field(None, description="Estado habilitado/deshabilitado")

# ============================================================================
# VARIABLES COMPARTIDAS
# ============================================================================

# Cola para eventos de progreso (SSE)
progress_queues: Dict[str, asyncio.Queue] = {}

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

async def send_progress_event(event: Dict[str, Any]):
    """Enviar evento de progreso a todos los clientes conectados"""
    for client_id, queue in list(progress_queues.items()):
        try:
            await queue.put(event)
        except Exception as e:
            backend_logger.error(f"Error enviando evento a cliente {client_id}: {e}")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/documents/paths", tags=["Documentos"])
async def get_document_paths_endpoint(enabled_only: bool = True):
    """
    Obtener lista de rutas de documentos configuradas
    
    Args:
        enabled_only: Si es True, solo retorna rutas habilitadas
        
    Returns:
        Lista de rutas con su informacion
    """
    try:
        from db_manager import get_document_paths
        
        paths = get_document_paths(enabled_only=enabled_only)
        
        return {
            "success": True,
            "paths": paths,
            "count": len(paths)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener rutas: {str(e)}")


@router.post("/documents/paths", tags=["Documentos"])
async def add_document_path_endpoint(request: DocumentPathCreate):
    """
    Agregar una nueva ruta de documentos
    
    Args:
        request: Objeto con la ruta a agregar
        
    Returns:
        Confirmacion de creacion
    """
    try:
        from db_manager import add_document_path
        import os
        
        path = request.path
        
        # Validar que la ruta exista
        if not os.path.exists(path):
            raise HTTPException(status_code=400, detail="La ruta no existe")
        
        if not os.path.isdir(path):
            raise HTTPException(status_code=400, detail="La ruta no es un directorio")
        
        success = add_document_path(path)
        
        if success:
            return {
                "success": True,
                "message": "Ruta agregada exitosamente",
                "path": path
            }
        else:
            raise HTTPException(status_code=409, detail="La ruta ya existe")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al agregar ruta: {str(e)}")


@router.put("/documents/paths/{path_id}", tags=["Documentos"])
async def update_document_path_endpoint(
    path_id: int,
    request: DocumentPathUpdate
):
    """
    Actualizar una ruta de documentos
    
    Args:
        path_id: ID de la ruta a actualizar
        request: Objeto con los campos a actualizar
        
    Returns:
        Confirmacion de actualizacion
    """
    try:
        from db_manager import update_document_path, get_document_paths
        from vector_manager import VectorManager
        import os
        
        # Si se proporciona nueva ruta, validarla
        if request.new_path:
            if not os.path.exists(request.new_path):
                raise HTTPException(status_code=400, detail="La nueva ruta no existe")
            
            if not os.path.isdir(request.new_path):
                raise HTTPException(status_code=400, detail="La nueva ruta no es un directorio")
        
        # Si se está deshabilitando, eliminar documentos de ChromaDB
        deleted_chunks = 0
        if request.enabled is False:
            backend_logger.info(f"Deshabilitando ruta {path_id}, eliminando documentos de ChromaDB...")
            
            # Obtener la ruta actual antes de actualizarla
            paths = get_document_paths(enabled_only=False)
            current_path_data = next((p for p in paths if p['id'] == path_id), None)
            
            if current_path_data:
                try:
                    vector_manager = VectorManager()
                    deleted_chunks = vector_manager.delete_documents_by_path_sync(current_path_data['path'])
                    backend_logger.info(f"Eliminados {deleted_chunks} chunks de ChromaDB")
                except Exception as e:
                    backend_logger.error(f"Error eliminando documentos de ChromaDB: {e}")
                    # Continuar con la actualización aunque falle la eliminación
        
        # Actualizar la ruta en la BD
        success = update_document_path(
            path_id=path_id,
            new_path=request.new_path,
            enabled=request.enabled
        )
        
        if success:
            message = "Ruta actualizada exitosamente"
            if deleted_chunks > 0:
                message += f". Eliminados {deleted_chunks} chunks de ChromaDB"
            
            return {
                "success": True,
                "message": message,
                "deleted_chunks": deleted_chunks
            }
        else:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
            
    except HTTPException:
        raise
    except Exception as e:
        backend_logger.error(f"Error al actualizar ruta: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al actualizar ruta: {str(e)}")


@router.delete("/documents/paths/{path_id}", tags=["Documentos"])
async def delete_document_path_endpoint(path_id: int):
    """
    Eliminar una ruta de documentos
    
    Args:
        path_id: ID de la ruta a eliminar
        
    Returns:
        Confirmacion de eliminacion
    """
    try:
        from db_manager import delete_document_path
        
        success = delete_document_path(path_id)
        
        if success:
            return {
                "success": True,
                "message": "Ruta eliminada exitosamente"
            }
        else:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar ruta: {str(e)}")


@router.get("/documents/reindex/progress", tags=["Documentos"])
async def reindex_progress_stream(request: Request):
    """
    Stream de progreso en tiempo real para la reindexacion (Server-Sent Events)
    
    Returns:
        StreamingResponse con eventos SSE
    """
    # Crear una cola unica para este cliente
    client_id = id(request)
    queue = asyncio.Queue()
    progress_queues[str(client_id)] = queue
    
    async def event_generator():
        try:
            backend_logger.info(f"Cliente SSE conectado: {client_id}")
            
            # Enviar evento inicial
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Conectado al stream de progreso'})}\n\n"
            
            while True:
                # Esperar por eventos (con timeout para enviar keep-alive)
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    
                    # Si el evento es 'done', terminar el stream
                    if event.get('type') == 'done':
                        yield f"data: {json.dumps(event)}\n\n"
                        backend_logger.info(f"Stream finalizado para cliente: {client_id}")
                        break
                    
                    # Enviar evento de progreso
                    yield f"data: {json.dumps(event)}\n\n"
                    
                except asyncio.TimeoutError:
                    # Keep-alive: enviar comentario cada 15 segundos
                    yield f": keep-alive\n\n"
                    
        except asyncio.CancelledError:
            backend_logger.info(f"Cliente SSE desconectado: {client_id}")
        finally:
            # Limpiar cola del cliente
            if str(client_id) in progress_queues:
                del progress_queues[str(client_id)]
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Deshabilitar buffering en nginx
        }
    )


async def send_progress_event(event: Dict[str, Any]):
    """
    Enviar evento de progreso a todos los clientes conectados
    
    Args:
        event: Diccionario con datos del evento
    """
    for client_id, queue in list(progress_queues.items()):
        try:
            await queue.put(event)
        except Exception as e:
            backend_logger.error(f"Error enviando evento a cliente {client_id}: {e}")


@router.post("/documents/reindex", tags=["Documentos"])
async def reindex_documents_endpoint(background_tasks: BackgroundTasks):
    """
    Reindexar todos los documentos de las rutas configuradas
    
    Returns:
        Estado del proceso de reindexacion
    """
    try:
        from db_manager import get_document_paths, update_document_path, update_path_scan_time
        from document_loader import DocumentLoader
        from vector_manager import VectorManager
        from chunking_manager import ChunkingManager
        from pathlib import Path
        
        backend_logger.info("Iniciando reindexacion de documentos...")
        
        # Enviar evento inicial
        await send_progress_event({
            'type': 'start',
            'message': 'Iniciando reindexacion...',
            'progress': 0
        })
        
        # Obtener rutas habilitadas
        paths = get_document_paths(enabled_only=True)
        
        backend_logger.info(f"Rutas habilitadas encontradas: {len(paths)}")
        
        await send_progress_event({
            'type': 'info',
            'message': f'Encontradas {len(paths)} ruta(s) habilitada(s)',
            'progress': 5
        })
        
        if not paths:
            # Verificar si hay rutas deshabilitadas
            all_paths = get_document_paths(enabled_only=False)
            if all_paths:
                return {
                    "success": False,
                    "message": f"No hay rutas habilitadas. Tienes {len(all_paths)} ruta(s) deshabilitada(s).",
                    "stats": {
                        "processed_paths": 0,
                        "total_documents": 0,
                        "total_chunks": 0,
                        "errors": ["Todas las rutas estan deshabilitadas"]
                    }
                }
            else:
                return {
                    "success": False,
                    "message": "No hay rutas configuradas. Agrega rutas primero.",
                    "stats": {
                        "processed_paths": 0,
                        "total_documents": 0,
                        "total_chunks": 0,
                        "errors": ["No hay rutas configuradas en la base de datos"]
                    }
                }
        
        # Inicializar componentes
        backend_logger.info("Inicializando componentes de indexacion...")
        
        await send_progress_event({
            'type': 'info',
            'message': 'Inicializando componentes...',
            'progress': 10
        })
        
        loader = DocumentLoader()
        vector_manager = VectorManager()
        chunking_manager = ChunkingManager()
        
        total_docs = 0
        total_chunks = 0
        processed_paths = 0
        errors = []
        warnings = []
        
        # Procesar cada ruta
        for idx, path_data in enumerate(paths, 1):
            try:
                path_str = path_data['path']
                path_obj = Path(path_str)
                
                # Calcular progreso base (10-90%, dividido por rutas)
                base_progress = 10 + (70 * idx / len(paths))
                
                backend_logger.info(f"Procesando ruta {idx}/{len(paths)}: {path_str}")
                
                await send_progress_event({
                    'type': 'processing',
                    'message': f'Procesando ruta {idx}/{len(paths)}: {Path(path_str).name}',
                    'progress': int(base_progress),
                    'current_path': path_str,
                    'path_index': idx,
                    'total_paths': len(paths)
                })
                
                if not path_obj.exists():
                    error_msg = f"Ruta no existe: {path_str}"
                    backend_logger.error(error_msg)
                    errors.append(error_msg)
                    
                    await send_progress_event({
                        'type': 'error',
                        'message': f'Error: Ruta no existe - {Path(path_str).name}',
                        'progress': int(base_progress)
                    })
                    continue
                
                if not path_obj.is_dir():
                    error_msg = f"La ruta no es un directorio: {path_str}"
                    backend_logger.error(error_msg)
                    errors.append(error_msg)
                    
                    await send_progress_event({
                        'type': 'error',
                        'message': f'Error: No es un directorio - {Path(path_str).name}',
                        'progress': int(base_progress)
                    })
                    continue
                
                # Cargar documentos (sin hash previo = reindexar todo)
                backend_logger.info(f"Cargando documentos de: {path_str}")
                
                await send_progress_event({
                    'type': 'loading',
                    'message': f'Cargando documentos de: {Path(path_str).name}...',
                    'progress': int(base_progress + 2)
                })
                
                docs, metadata_dict = loader.load_documents(path_obj, existing_hashes=None)
                
                if not docs:
                    warning_msg = f"No se encontraron documentos en: {path_str}"
                    backend_logger.warning(warning_msg)
                    warnings.append(warning_msg)
                    
                    await send_progress_event({
                        'type': 'warning',
                        'message': f'Sin documentos en: {Path(path_str).name}',
                        'progress': int(base_progress + 5)
                    })
                    
                    # Actualizar con 0 documentos
                    update_document_path(
                        path_id=path_data['id'],
                        documents_count=0
                    )
                    update_path_scan_time(path_data['id'])
                    processed_paths += 1
                    continue
                
                backend_logger.info(f"Documentos cargados: {len(docs)}, Archivos procesados: {len(metadata_dict)}")
                
                await send_progress_event({
                    'type': 'loading',
                    'message': f'Cargados {len(docs)} documentos de {Path(path_str).name}',
                    'progress': int(base_progress + 10),
                    'documents_loaded': len(docs)
                })
                
                # Generar chunks
                backend_logger.info(f"Generando chunks...")
                
                await send_progress_event({
                    'type': 'chunking',
                    'message': f'Generando chunks...',
                    'progress': int(base_progress + 15)
                })
                
                chunks = chunking_manager.split_documents_adaptive(docs)
                backend_logger.info(f"Chunks generados: {len(chunks)}")
                
                await send_progress_event({
                    'type': 'chunking',
                    'message': f'Generados {len(chunks)} chunks',
                    'progress': int(base_progress + 25),
                    'chunks_generated': len(chunks)
                })
                
                # Inicializar vectorstore si no existe
                backend_logger.info(f"Inicializando vectorstore...")
                vectorstore = vector_manager.initialize_vectorstore()
                
                # Agregar a ChromaDB
                backend_logger.info(f"Agregando {len(chunks)} chunks a ChromaDB...")
                
                await send_progress_event({
                    'type': 'embedding',
                    'message': f'Generando embeddings y almacenando en ChromaDB...',
                    'progress': int(base_progress + 30)
                })
                
                vectorstore.add_documents(chunks)
                backend_logger.info(f"Chunks agregados exitosamente")
                
                await send_progress_event({
                    'type': 'success',
                    'message': f'Completado: {Path(path_str).name} ({len(chunks)} chunks)',
                    'progress': int(base_progress + 50),
                    'chunks_stored': len(chunks)
                })
                
                # Actualizar estadisticas
                total_docs += len(docs)
                total_chunks += len(chunks)
                processed_paths += 1
                
                # Actualizar BD con conteo y timestamp
                update_document_path(
                    path_id=path_data['id'],
                    documents_count=len(metadata_dict)
                )
                update_path_scan_time(path_data['id'])
                
                backend_logger.info(f"Ruta procesada exitosamente: {path_str}")
                
            except Exception as e:
                backend_logger.error(
                    f"Error en {path_data.get('path', 'ruta desconocida')}: {str(e)}",
                    exc_info=True
                )
                user_error_msg = f"Error procesando la ruta '{path_data.get('path', 'ruta desconocida')}'. Consulta los registros del sistema para más detalles."
                errors.append(user_error_msg)
                
                await send_progress_event({
                    'type': 'error',
                    'message': "Error procesando ruta.",
                    'progress': int(base_progress)
                })
        
        all_issues = errors + warnings
        
        # Enviar evento final
        await send_progress_event({
            'type': 'complete',
            'message': f'Reindexacion completada: {total_docs} documentos, {total_chunks} chunks',
            'progress': 100,
            'stats': {
                'processed_paths': processed_paths,
                'total_documents': total_docs,
                'total_chunks': total_chunks,
                'errors_count': len(errors),
                'warnings_count': len(warnings)
            }
        })
        
        # Enviar evento de finalizacion del stream
        await send_progress_event({'type': 'done'})
        
        result = {
            "success": True,
            "message": f"Reindexacion completada: {total_docs} documentos, {total_chunks} chunks",
            "stats": {
                "processed_paths": processed_paths,
                "total_paths_enabled": len(paths),
                "total_documents": total_docs,
                "total_chunks": total_chunks,
                "errors": errors,
                "warnings": warnings,
                "all_issues": all_issues
            }
        }
        
        backend_logger.info(f"Reindexacion completada: {result}")
        
        return result
        
    except Exception as e:
        backend_logger.error(f"Error en reindexacion: {e}", exc_info=True)
        
        # Enviar evento de error final
        await send_progress_event({
            'type': 'error',
            'message': f'Error fatal: {str(e)}',
            'progress': 0
        })
        await send_progress_event({'type': 'done'})
        
        raise HTTPException(status_code=500, detail=f"Error al reindexar: {str(e)}")


@router.delete("/documents/index", tags=["Documentos"])
async def clear_index_endpoint():
    """
    Limpiar el indice completo de documentos
    
    ESTRATEGIA: En lugar de eliminar el directorio ChromaDB (que causa problemas
    en Windows por archivos bloqueados), simplemente VACIAMOS la coleccion.
    Esto es mas rapido, seguro y funciona perfectamente.
    
    Returns:
        Confirmacion de limpieza
    """
    try:
        from vector_manager import VectorManager
        from db_manager import get_document_paths, update_document_path
        import shutil
        import time
        
        backend_logger.info("Iniciando limpieza completa del indice...")
        backend_logger.info("Estrategia: Vaciar coleccion de ChromaDB (sin eliminar directorio)")
        
        deleted_count = 0
        
        # PASO 1: Limpiar coleccion de ChromaDB directamente
        try:
            backend_logger.info("Limpiando coleccion de ChromaDB...")
            
            # Importar ChromaDB directamente para acceder a la coleccion
            import chromadb
            from pathlib import Path
            
            # Calcular ruta de ChromaDB
            backend_dir = Path(__file__).parent.parent  # backend/
            project_root = backend_dir.parent  # Alfred/
            chroma_db_path = str(project_root / 'chroma_db')
            
            backend_logger.info(f"Conectando a ChromaDB en: {chroma_db_path}")
            
            # Conectar a ChromaDB
            client = chromadb.PersistentClient(path=chroma_db_path)
            
            # Obtener o crear la coleccion (nombre: "langchain" - usado por LangChain)
            try:
                collection = client.get_collection("langchain")
                backend_logger.info(f"Coleccion encontrada: langchain")
                
                # Obtener todos los IDs
                all_data = collection.get()
                if all_data and 'ids' in all_data and all_data['ids']:
                    deleted_count = len(all_data['ids'])
                    backend_logger.info(f"Encontrados {deleted_count} documentos en la coleccion")
                    
                    # Eliminar todos los documentos
                    collection.delete(ids=all_data['ids'])
                    backend_logger.info(f"✅ {deleted_count} documentos eliminados exitosamente")
                    
                    # Verificar que se eliminaron
                    verification = collection.get()
                    remaining = len(verification['ids']) if verification and 'ids' in verification else 0
                    backend_logger.info(f"Verificacion: {remaining} documentos restantes")
                else:
                    backend_logger.info("La coleccion ya estaba vacia")
                    
            except Exception as col_err:
                backend_logger.warning(f"No se pudo acceder a la coleccion: {col_err}")
                backend_logger.info("La coleccion podria no existir aun o esta vacia")
            
            # Cerrar cliente
            del client
            backend_logger.info("Cliente de ChromaDB cerrado")
            
        except Exception as e:
            backend_logger.warning(f"Error al limpiar ChromaDB directamente: {e}")
            # No fallar, intentar con VectorManager como fallback
            
            try:
                backend_logger.info("Intentando fallback via VectorManager...")
                vector_manager = VectorManager()
                
                # Forzar inicializacion del vectorstore
                _ = vector_manager.vectorstore  # Esto inicializa _vectorstore
                
                if vector_manager._vectorstore and hasattr(vector_manager._vectorstore, '_collection'):
                    collection = vector_manager._vectorstore._collection
                    
                    all_data = collection.get()
                    if all_data and 'ids' in all_data and all_data['ids']:
                        deleted_count = len(all_data['ids'])
                        backend_logger.info(f"Eliminando {deleted_count} documentos via VectorManager...")
                        collection.delete(ids=all_data['ids'])
                        backend_logger.info(f"✅ {deleted_count} documentos eliminados exitosamente")
                
                # Limpiar referencias
                vector_manager._vectorstore = None
                vector_manager._client = None
                del vector_manager
                backend_logger.info("Referencias de VectorManager limpiadas")
                
            except Exception as vm_err:
                backend_logger.error(f"Fallback via VectorManager tambien fallo: {vm_err}")
        
        # PASO 2: Resetear completamente alfred_core
        alfred_core = get_alfred_core_instance()
        try:
            if alfred_core:
                backend_logger.info("Reseteando alfred_core completo...")
                
                # Cerrar y limpiar vector_manager
                if hasattr(alfred_core, 'vector_manager') and alfred_core.vector_manager:
                    try:
                        if hasattr(alfred_core.vector_manager, '_vectorstore'):
                            alfred_core.vector_manager._vectorstore = None
                        if hasattr(alfred_core.vector_manager, '_client'):
                            alfred_core.vector_manager._client = None
                    except Exception as vm_err:
                        backend_logger.warning(f"Error al limpiar vector_manager: {vm_err}")
                
                # Cerrar y limpiar retriever
                if hasattr(alfred_core, 'retriever') and alfred_core.retriever:
                    try:
                        alfred_core.retriever = None
                    except Exception as ret_err:
                        backend_logger.warning(f"Error al limpiar retriever: {ret_err}")
                
                # Cerrar y limpiar retrieval_chain
                if hasattr(alfred_core, 'retrieval_chain') and alfred_core.retrieval_chain:
                    try:
                        alfred_core.retrieval_chain = None
                    except Exception as chain_err:
                        backend_logger.warning(f"Error al limpiar retrieval_chain: {chain_err}")
                
                # Resetear alfred_core a None para forzar reinicializacion
                alfred_core = None
                backend_logger.info("✅ alfred_core reseteado completamente")
                
        except Exception as e:
            backend_logger.warning(f"Error al resetear alfred_core: {e}")
        
        # PASO 3: Forzar liberacion de recursos
        import gc
        gc.collect()
        backend_logger.info("Garbage collection ejecutado")
        
        # PASO 4: Resetear contadores en todas las rutas
        paths = get_document_paths(enabled_only=False)
        backend_logger.info(f"Reseteando contadores de {len(paths)} rutas...")
        
        for path_data in paths:
            update_document_path(
                path_id=path_data['id'],
                documents_count=0
            )
            backend_logger.info(f"Reseteado: {path_data['path']}")
        
        backend_logger.info("Limpieza completa exitosa")
        
        return {
            "success": True,
            "message": f"Indice limpiado completamente. {len(paths)} rutas reseteadas.",
            "cleared_paths": len(paths)
        }
        
    except Exception as e:
        backend_logger.error(f"Error al limpiar indice: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al limpiar indice: {str(e)}")


@router.get("/documents/stats", tags=["Documentos"])
async def get_documents_stats_endpoint():
    """
    Obtener estadisticas detalladas de documentos indexados
    
    Returns:
        Estadisticas completas del sistema de documentos
    """
    try:
        from db_manager import get_document_paths
        from vector_manager import VectorManager
        
        # Obtener rutas configuradas
        all_paths = get_document_paths(enabled_only=False)
        enabled_paths = get_document_paths(enabled_only=True)
        
        # Contar documentos totales
        total_docs = sum(p.get('documents_count', 0) for p in all_paths)
        
        # Obtener info de ChromaDB
        try:
            # Acceder directamente a ChromaDB para obtener conteo real
            import chromadb
            from pathlib import Path
            
            backend_dir = Path(__file__).parent.parent
            project_root = backend_dir.parent
            chroma_db_path = str(project_root / 'chroma_db')
            
            client = chromadb.PersistentClient(path=chroma_db_path)
            
            try:
                collection = client.get_collection("langchain")
                total_chunks = collection.count()
                total_vectors = total_chunks
                backend_logger.info(f"Stats: {total_chunks} chunks en ChromaDB")
            except Exception as col_err:
                # Coleccion no existe o esta vacia
                total_chunks = 0
                total_vectors = 0
                backend_logger.info(f"Stats: ChromaDB vacio o coleccion no existe")
            
            del client
            
        except Exception as e:
            backend_logger.warning(f"Error obteniendo stats de ChromaDB: {e}")
            total_chunks = 0
            total_vectors = 0
        
        # Calcular ultima actualizacion
        last_scan_times = [
            p.get('last_scan') for p in all_paths 
            if p.get('last_scan')
        ]
        last_update = max(last_scan_times) if last_scan_times else None
        
        return {
            "success": True,
            "stats": {
                "total_paths": len(all_paths),
                "enabled_paths": len(enabled_paths),
                "total_documents": total_docs,
                "total_chunks": total_chunks,
                "total_vectors": total_vectors,
                "last_update": last_update,
                "paths_details": all_paths
            }
        }
        
    except Exception as e:
        backend_logger.error(f"Error obteniendo estadisticas: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener estadisticas: {str(e)}")
