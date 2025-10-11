"""
Vector Manager - Gestion de embeddings y sincronizacion con ChromaDB
Implementa indexacion incremental y operaciones de vector store
VERSION OPTIMIZADA: DuckDB+Parquet, chunking adaptativo, cache LRU
"""

import asyncio
import os
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.vectorstores.utils import filter_complex_metadata
from langchain_core.documents import Document

from utils.logger import get_logger
from utils.paths import get_data_path
from document_loader import DocumentLoader, DocumentMetadata
from embedding_manager import get_embedding_manager
from chunking_manager import get_chunking_manager
from db_manager import (
    insert_document_meta,
    get_all_document_hashes,
    delete_document_meta,
    update_document_status,
    get_document_stats
)

logger = get_logger("vector_manager")


class VectorManager:
    """
    Gestor de vectores con soporte para indexacion incremental
    Maneja ChromaDB y sincronizacion con metadata en SQLite
    VERSION OPTIMIZADA con DuckDB+Parquet y chunking adaptativo
    """
    
    def __init__(
        self,
        chroma_db_path: Optional[str] = None,
        embedding_model: Optional[str] = None,
        use_optimized_storage: bool = True
    ):
        """
        Inicializar Vector Manager
        
        Args:
            chroma_db_path: Ruta al directorio de ChromaDB (None = ruta optimizada)
            embedding_model: Modelo de embeddings (None = seleccion automatica)
            use_optimized_storage: Usar almacenamiento optimizado DuckDB+Parquet
        """
        # Configurar ruta optimizada si no se especifica
        # if chroma_db_path is None:
        #     if use_optimized_storage:
        #         # Usar ruta en %AppData%\Alfred\data\chroma_store
        #         data_path = get_data_path()
        #         self.chroma_db_path = str(data_path / "chroma_store")
        #         logger.info(f"Usando almacenamiento optimizado: {self.chroma_db_path}")
        #     else:
        #         self.chroma_db_path = "./chroma_db"
        # else:
        #     self.chroma_db_path = chroma_db_path

        # CORRECCION: La ChromaDB esta en AlfredElectron/chroma_db (fuera de backend/)
        # Calcular ruta absoluta desde la ubicacion de este archivo
        if chroma_db_path is None:
            # Este archivo esta en: AlfredElectron/backend/core/vector_manager.py
            # ChromaDB esta en:     AlfredElectron/chroma_db/
            # Subir 2 niveles: core -> backend -> AlfredElectron
            project_root = Path(__file__).parent.parent.parent
            self.chroma_db_path = str(project_root / "chroma_db")
            logger.info(f"Usando ruta calculada de ChromaDB: {self.chroma_db_path}")
        else:
            self.chroma_db_path = chroma_db_path
        
        # Crear directorio si no existe
        Path(self.chroma_db_path).mkdir(parents=True, exist_ok=True)
        
        # Managers optimizados
        self._embedding_manager = get_embedding_manager(embedding_model)
        self._chunking_manager = get_chunking_manager()
        
        # Componentes lazy-loaded
        self._embeddings = None
        self._vectorstore = None
        self._document_loader = None
        
        # Configuracion de ChromaDB
        self.use_optimized_storage = use_optimized_storage
        self._chroma_settings = None
        
        # Thread pool para operaciones paralelas
        self._executor = ThreadPoolExecutor(max_workers=4)
        
        logger.info("Vector Manager inicializado con optimizaciones")
    
    def _get_chroma_settings(self):
        """
        Configurar settings optimizados de ChromaDB
        
        Returns:
            Settings de ChromaDB
        """
        if self._chroma_settings is not None:
            return self._chroma_settings
        
        if self.use_optimized_storage:
            try:
                import chromadb
                
                # Configuracion actualizada para ChromaDB 0.4+
                self._chroma_settings = chromadb.Settings(
                    persist_directory=self.chroma_db_path,
                    anonymized_telemetry=False,
                    allow_reset=True
                )
                
                logger.info("ChromaDB configurado con persistencia optimizada")
            
            except Exception as e:
                logger.warning(f"No se pudo configurar ChromaDB optimizado: {e}")
                logger.info("Usando configuracion por defecto de ChromaDB")
                self._chroma_settings = None
        else:
            self._chroma_settings = None
        
        return self._chroma_settings
    
    @property
    def embeddings(self) -> OllamaEmbeddings:
        """Lazy loading de embeddings con seleccion automatica"""
        if self._embeddings is None:
            logger.info("Inicializando embeddings optimizados...")
            self._embeddings = self._embedding_manager.get_embeddings()
            
            # Mostrar info del modelo seleccionado
            model_info = self._embedding_manager.get_model_info()
            logger.info(f"Modelo de embeddings: {model_info['name']}")
            logger.info(f"  Dimension: {model_info['dimension']}")
            logger.info(f"  Calidad: {model_info['quality']}, Velocidad: {model_info['speed']}")
        
        return self._embeddings
    
    @property
    def chunking_manager(self):
        """Obtener chunking manager"""
        return self._chunking_manager
    
    @property
    def document_loader(self) -> DocumentLoader:
        """Lazy loading de document loader"""
        if self._document_loader is None:
            self._document_loader = DocumentLoader()
        return self._document_loader
    
    def initialize_vectorstore(self, force_reload: bool = False) -> Chroma:
        """
        Inicializar o cargar vectorstore existente con configuracion optimizada
        
        Args:
            force_reload: Forzar recarga completa
            
        Returns:
            Instancia de Chroma vectorstore
        """
        try:
            if self._vectorstore is not None and not force_reload:
                return self._vectorstore
            
            chroma_path = Path(self.chroma_db_path)
            # NO usamos settings - puede causar conflicto con persist_directory
            
            logger.info(f"DEBUG: chroma_path={chroma_path}, exists={chroma_path.exists()}, force_reload={force_reload}")
            print(f"[DEBUG] chroma_path={chroma_path}, exists={chroma_path.exists()}, force_reload={force_reload}")
            
            if chroma_path.exists() and not force_reload:
                logger.info("Cargando vectorstore existente...")
                print("[DEBUG] Cargando vectorstore existente...")
            elif force_reload:
                logger.info("Forzando recarga de vectorstore")
                print("[DEBUG] Forzando recarga de vectorstore")
            else:
                logger.info("Creando nuevo vectorstore")
                print("[DEBUG] Creando nuevo vectorstore")
            
            # Siempre crear/cargar el vectorstore (excepto si force_reload y no hay docs)
            print(f"[DEBUG] Creando Chroma con persist_directory={self.chroma_db_path}")
            kwargs = {
                'persist_directory': self.chroma_db_path,
                'embedding_function': self.embeddings,
                'collection_name': 'langchain'  # Usar el nombre correcto de la coleccion
                # NO pasamos client_settings - puede causar conflicto con persist_directory
            }
            
            print(f"[DEBUG] Chroma kwargs: {list(kwargs.keys())}")
            
            try:
                self._vectorstore = Chroma(**kwargs)
                print(f"[DEBUG] Chroma creado exitosamente: {type(self._vectorstore)}")
            except Exception as e:
                print(f"[DEBUG ERROR] Error creando Chroma: {e}")
                import traceback
                traceback.print_exc()
                raise
            
            # Verificar contenido
            print(f"[DEBUG] Verificando contenido...")
            try:
                collection = self._vectorstore._collection
                count = collection.count()
                logger.info(f"Vectorstore cargado: {count} documentos")
                print(f"[DEBUG] Vectorstore cargado: {count} documentos")
                
                if count == 0:
                    logger.warning("Vectorstore vacio, se requiere indexacion")
            
            except Exception as e:
                print(f"[DEBUG ERROR] Error verificando vectorstore: {e}")
                logger.error(f"Error verificando vectorstore: {e}")
                import traceback
                traceback.print_exc()
                raise
            
            print(f"[DEBUG] Retornando vectorstore: {self._vectorstore}")
            return self._vectorstore
            
        except Exception as e:
            print(f"[ERROR FATAL] en initialize_vectorstore: {e}")
            logger.error(f"Error FATAL en initialize_vectorstore: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def split_documents(self, docs: List[Document]) -> List[Document]:
        """
        Dividir documentos en chunks usando chunking adaptativo
        
        Args:
            docs: Lista de documentos a dividir
            
        Returns:
            Lista de documentos divididos en chunks
        """
        logger.info(f"Dividiendo {len(docs)} documentos con chunking adaptativo...")
        
        # Usar chunking manager para division adaptativa
        splits = self._chunking_manager.split_documents_adaptive(docs)
        
        # Filtrar metadata compleja
        splits = filter_complex_metadata(splits)
        
        logger.info(f"Generados {len(splits)} chunks con estrategias adaptativas")
        
        return splits
    
    async def index_documents_incremental(
        self,
        docs_path: Path,
        force_reindex: bool = False
    ) -> Dict[str, any]:
        """
        Indexar documentos de forma incremental
        Solo procesa archivos nuevos o modificados
        
        Args:
            docs_path: Directorio con documentos
            force_reindex: Forzar reindexacion completa
            
        Returns:
            Dict con estadisticas de indexacion
        """
        logger.info(f"Iniciando indexacion incremental de: {docs_path}")
        
        # Obtener hashes existentes de BD
        existing_hashes = {} if force_reindex else get_all_document_hashes()
        logger.info(f"Documentos previamente indexados: {len(existing_hashes)}")
        
        # Cargar documentos (solo nuevos/modificados)
        docs, metadata_dict = self.document_loader.load_documents(
            docs_path,
            existing_hashes
        )
        
        if not docs:
            logger.info("No hay documentos nuevos o modificados para indexar")
            return {
                'new_documents': 0,
                'modified_documents': 0,
                'total_chunks': 0,
                'skipped': len(existing_hashes)
            }
        
        # Dividir en chunks
        splits = self.split_documents(docs)
        
        # Indexar en ChromaDB
        logger.info("Creando/actualizando vectorstore con nuevos documentos...")
        
        if self._vectorstore is None:
            # Crear nuevo vectorstore
            self._vectorstore = await asyncio.get_event_loop().run_in_executor(
                self._executor,
                lambda: Chroma.from_documents(
                    documents=splits,
                    embedding=self.embeddings,
                    persist_directory=self.chroma_db_path,
                    collection_name='langchain'  # AGREGADO: Usar nombre consistente
                )
            )
            logger.info("Vectorstore creado exitosamente")
        else:
            # Agregar a vectorstore existente
            await asyncio.get_event_loop().run_in_executor(
                self._executor,
                lambda: self._vectorstore.add_documents(splits)
            )
            logger.info("Documentos agregados al vectorstore existente")
        
        # Actualizar metadata en SQLite
        logger.info("Actualizando metadata en base de datos...")
        chunks_by_file = self._count_chunks_by_file(splits)
        
        for file_path, metadata in metadata_dict.items():
            chunk_count = chunks_by_file.get(file_path, 0)
            
            insert_document_meta(
                file_path=metadata.file_path,
                file_hash=metadata.file_hash,
                file_size=metadata.file_size,
                last_modified=metadata.last_modified,
                indexed_at=metadata.loaded_at,
                doc_type=metadata.doc_type,
                chunk_count=chunk_count,
                status="indexed"
            )
        
        # Estadisticas
        new_files = sum(1 for m in metadata_dict.values() if m.is_changed)
        modified_files = len(metadata_dict) - new_files
        
        stats = {
            'new_documents': new_files,
            'modified_documents': modified_files,
            'total_chunks': len(splits),
            'skipped': len(existing_hashes),
            'failed': len(self.document_loader.get_failed_files())
        }
        
        logger.info(f"Indexacion completada: {stats}")
        return stats
    
    def _count_chunks_by_file(self, splits: List[Document]) -> Dict[str, int]:
        """
        Contar chunks por archivo
        
        Args:
            splits: Lista de chunks
            
        Returns:
            Dict {file_path: chunk_count}
        """
        counts = {}
        for doc in splits:
            file_path = doc.metadata.get('source', '')
            counts[file_path] = counts.get(file_path, 0) + 1
        return counts
    
    async def delete_documents(self, file_paths: List[str]) -> int:
        """
        Eliminar documentos del vectorstore y metadata
        
        Args:
            file_paths: Lista de rutas de archivos a eliminar
            
        Returns:
            Numero de documentos eliminados
        """
        if not self._vectorstore:
            logger.warning("Vectorstore no inicializado")
            return 0
        
        deleted = 0
        
        for file_path in file_paths:
            try:
                # Eliminar de ChromaDB (buscar por metadata.source)
                # Nota: ChromaDB no tiene API directa para delete by metadata
                # Alternativa: marcar como eliminado en SQLite
                update_document_status(file_path, "deleted")
                deleted += 1
                logger.info(f"Documento marcado como eliminado: {file_path}")
            
            except Exception as e:
                logger.error(f"Error eliminando {file_path}: {e}")
        
        return deleted
    
    async def reindex_all(self, docs_path: Path) -> Dict[str, any]:
        """
        Reindexar todos los documentos desde cero
        
        Args:
            docs_path: Directorio con documentos
            
        Returns:
            Dict con estadisticas de reindexacion
        """
        logger.warning("Iniciando reindexacion completa (esto puede tomar tiempo)...")
        
        # Limpiar vectorstore
        chroma_path = Path(self.chroma_db_path)
        if chroma_path.exists():
            import shutil
            shutil.rmtree(chroma_path)
            logger.info("Vectorstore anterior eliminado")
        
        self._vectorstore = None
        
        # Reindexar
        stats = await self.index_documents_incremental(docs_path, force_reindex=True)
        
        logger.info("Reindexacion completa finalizada")
        return stats
    
    def get_stats(self) -> Dict[str, any]:
        """
        Obtener estadisticas del vector manager
        
        Returns:
            Dict con estadisticas
        """
        stats = get_document_stats()
        
        # Agregar info de vectorstore
        if self._vectorstore:
            try:
                collection = self._vectorstore._collection
                vector_count = collection.count()
                stats['vector_count'] = vector_count
            except:
                stats['vector_count'] = 0
        else:
            stats['vector_count'] = 0
        
        return stats
    
    def get_vectorstore(self) -> Optional[Chroma]:
        """Obtener instancia del vectorstore"""
        return self._vectorstore
    
    def close(self):
        """Cerrar recursos"""
        if self._executor:
            self._executor.shutdown(wait=True)
        logger.info("Vector manager cerrado")
