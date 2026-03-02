"""
Document Loader - Carga y normalizacion de documentos
Maneja la lectura de archivos, generacion de hash y deteccion de cambios
"""

import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_core.documents import Document
from utils.logger import get_logger

logger = get_logger("document_loader")


@dataclass
class DocumentMetadata:
    """Metadata de un documento procesado"""
    file_path: str
    file_hash: str
    file_size: int
    last_modified: float
    loaded_at: str
    doc_type: str
    is_changed: bool = False


class DocumentLoader:
    """
    Cargador de documentos con soporte para multiples formatos
    Genera hash SHA256 para deteccion de cambios
    """
    
    SUPPORTED_EXTENSIONS = {
        '.pdf': PyPDFLoader,
        '.txt': TextLoader,
        '.md': TextLoader,
        '.csv': TextLoader,
        '.json': TextLoader,
        '.xml': TextLoader,
        '.html': TextLoader,
        '.docx': Docx2txtLoader,
    }
    
    def __init__(self):
        """Inicializar document loader"""
        self.loaded_files: Dict[str, DocumentMetadata] = {}
        self.failed_files: List[Tuple[str, str]] = []
    
    @staticmethod
    def calculate_file_hash(file_path: Path) -> str:
        """
        Calcular hash SHA256 de un archivo
        
        Args:
            file_path: Ruta del archivo
            
        Returns:
            Hash SHA256 como string hexadecimal
        """
        sha256_hash = hashlib.sha256()
        
        try:
            with open(file_path, "rb") as f:
                # Leer en chunks para archivos grandes
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            
            return sha256_hash.hexdigest()
        
        except Exception as e:
            logger.error(f"Error calculando hash de {file_path}: {e}")
            raise
    
    def get_loader_for_file(self, file_path: Path) -> Optional[type]:
        """
        Obtener la clase loader apropiada para un archivo
        
        Args:
            file_path: Ruta del archivo
            
        Returns:
            Clase loader o None si no esta soportado
        """
        suffix = file_path.suffix.lower()
        return self.SUPPORTED_EXTENSIONS.get(suffix)
    
    def load_single_document(
        self, 
        file_path: Path,
        existing_hash: Optional[str] = None
    ) -> Tuple[List[Document], DocumentMetadata]:
        """
        Cargar un documento individual
        
        Args:
            file_path: Ruta del archivo a cargar
            existing_hash: Hash existente en BD (para comparacion)
            
        Returns:
            Tupla (documentos_cargados, metadata)
        """
        try:
            # Calcular hash actual
            current_hash = self.calculate_file_hash(file_path)
            
            # Obtener informacion del archivo
            stat = file_path.stat()
            
            # Crear metadata
            metadata = DocumentMetadata(
                file_path=str(file_path),
                file_hash=current_hash,
                file_size=stat.st_size,
                last_modified=stat.st_mtime,
                loaded_at=datetime.now().isoformat(),
                doc_type=file_path.suffix.lower(),
                is_changed=(existing_hash != current_hash) if existing_hash else True
            )
            
            # Si no hay cambios y existe hash previo, retornar vacio
            if not metadata.is_changed and existing_hash:
                logger.info(f"Archivo sin cambios (saltado): {file_path.name}")
                return [], metadata
            
            # Obtener loader apropiado
            loader_class = self.get_loader_for_file(file_path)
            
            if not loader_class:
                # Intentar como texto plano
                logger.warning(f"Tipo no soportado, intentando como texto: {file_path.suffix}")
                loader_class = TextLoader
            
            # Cargar documento
            try:
                if loader_class == TextLoader:
                    loader = loader_class(str(file_path), encoding='utf-8')
                else:
                    loader = loader_class(str(file_path))
                
                docs = loader.load()
                
                # Enriquecer metadata de cada documento
                for doc in docs:
                    doc.metadata.update({
                        'file_hash': current_hash,
                        'file_size': stat.st_size,
                        'last_modified': stat.st_mtime,
                        'loaded_at': metadata.loaded_at
                    })
                
                logger.info(f"Documento cargado: {file_path.name} ({len(docs)} paginas/secciones)")
                return docs, metadata
                
            except UnicodeDecodeError:
                # Intentar con encoding alternativo
                logger.warning(f"Error UTF-8, intentando latin-1: {file_path.name}")
                loader = TextLoader(str(file_path), encoding='latin-1')
                docs = loader.load()
                
                for doc in docs:
                    doc.metadata.update({
                        'file_hash': current_hash,
                        'file_size': stat.st_size,
                        'last_modified': stat.st_mtime,
                        'loaded_at': metadata.loaded_at
                    })
                
                return docs, metadata
        
        except Exception as e:
            logger.error(f"Error cargando {file_path}: {e}")
            self.failed_files.append((str(file_path), str(e)))
            raise
    
    def load_documents(
        self,
        docs_path: Path,
        existing_hashes: Optional[Dict[str, str]] = None
    ) -> Tuple[List[Document], Dict[str, DocumentMetadata]]:
        """
        Cargar todos los documentos de un directorio
        
        Args:
            docs_path: Directorio con documentos
            existing_hashes: Dict con hashes existentes {file_path: hash}
            
        Returns:
            Tupla (todos_los_documentos, metadata_por_archivo)
        """
        existing_hashes = existing_hashes or {}
        all_docs = []
        metadata_dict = {}
        
        logger.info(f"Escaneando directorio: {docs_path}")
        
        # Obtener todos los archivos
        all_files = list(docs_path.rglob("*"))
        total_files = len([f for f in all_files if f.is_file()])
        
        logger.info(f"Total de archivos encontrados: {total_files}")
        
        processed = 0
        skipped = 0
        
        for file_path in all_files:
            if not file_path.is_file():
                continue
            
            try:
                file_key = str(file_path)
                existing_hash = existing_hashes.get(file_key)
                
                docs, metadata = self.load_single_document(file_path, existing_hash)
                
                # Solo agregar si hay documentos (hubo cambios)
                if docs:
                    all_docs.extend(docs)
                    metadata_dict[file_key] = metadata
                else:
                    skipped += 1
                
                processed += 1
                
                if processed % 10 == 0:
                    logger.info(f"Progreso: {processed}/{total_files} archivos procesados")
            
            except Exception as e:
                logger.error(f"Error procesando {file_path}: {e}")
                continue
        
        logger.info(f"Carga completada: {len(all_docs)} documentos de {processed} archivos")
        logger.info(f"Archivos saltados (sin cambios): {skipped}")
        
        if self.failed_files:
            logger.warning(f"Archivos fallidos: {len(self.failed_files)}")
            for failed_path, error in self.failed_files:
                logger.warning(f"  - {failed_path}: {error}")
        
        return all_docs, metadata_dict
    
    def get_failed_files(self) -> List[Tuple[str, str]]:
        """Obtener lista de archivos que fallaron al cargar"""
        return self.failed_files.copy()
    
    def reset(self):
        """Resetear estado interno del loader"""
        self.loaded_files.clear()
        self.failed_files.clear()


def scan_directory_for_changes(
    docs_path: Path,
    existing_hashes: Dict[str, str]
) -> Tuple[List[str], List[str], List[str]]:
    """
    Escanear directorio y detectar cambios sin cargar documentos
    
    Args:
        docs_path: Directorio a escanear
        existing_hashes: Hashes existentes en BD
        
    Returns:
        Tupla (archivos_nuevos, archivos_modificados, archivos_eliminados)
    """
    loader = DocumentLoader()
    
    new_files = []
    modified_files = []
    deleted_files = list(existing_hashes.keys())
    
    for file_path in docs_path.rglob("*"):
        if not file_path.is_file():
            continue
        
        file_key = str(file_path)
        
        try:
            current_hash = loader.calculate_file_hash(file_path)
            
            if file_key in existing_hashes:
                # Archivo existe en BD
                deleted_files.remove(file_key)
                
                if existing_hashes[file_key] != current_hash:
                    modified_files.append(file_key)
            else:
                # Archivo nuevo
                new_files.append(file_key)
        
        except Exception as e:
            logger.error(f"Error escaneando {file_path}: {e}")
            continue
    
    logger.info(f"Cambios detectados: {len(new_files)} nuevos, {len(modified_files)} modificados, {len(deleted_files)} eliminados")
    
    return new_files, modified_files, deleted_files
