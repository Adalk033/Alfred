"""
Chunking Manager - Estrategias adaptativas de chunking por tipo de documento
Optimiza el tamano de chunks segun el contenido
"""

from typing import List, Dict, Optional
from pathlib import Path
from dataclasses import dataclass

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    Language,
    RecursiveCharacterTextSplitter
)
from langchain_core.documents import Document

from utils.logger import get_logger

logger = get_logger("chunking_manager")


@dataclass
class ChunkingStrategy:
    """Configuracion de estrategia de chunking"""
    chunk_size: int
    chunk_overlap: int
    separators: List[str]
    description: str


class ChunkingManager:
    """
    Gestor de chunking adaptativo segun tipo de documento
    """
    
    # Estrategias por tipo de documento
    STRATEGIES = {
        "text": ChunkingStrategy(
            chunk_size=600,  # Reducido para velocidad (era 1000)
            chunk_overlap=100,
            separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""],
            description="Texto plano general"
        ),
        "code": ChunkingStrategy(
            chunk_size=500,  # Reducido (era 800)
            chunk_overlap=100,
            separators=["\n\nclass ", "\n\ndef ", "\n\n", "\n", " ", ""],
            description="Codigo fuente y Markdown"
        ),
        "document": ChunkingStrategy(
            chunk_size=800,  # Reducido (era 1500)
            chunk_overlap=150,
            separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""],
            description="PDFs y documentos de oficina"
        )
    }
    
    # Mapeo de extensiones a estrategias
    EXTENSION_MAP = {
        # Texto plano
        ".txt": "text",
        ".log": "text",
        ".csv": "text",
        ".json": "text",
        ".xml": "text",
        ".html": "text",
        
        # Codigo y Markdown
        ".py": "code",
        ".js": "code",
        ".ts": "code",
        ".jsx": "code",
        ".tsx": "code",
        ".java": "code",
        ".cpp": "code",
        ".c": "code",
        ".h": "code",
        ".cs": "code",
        ".php": "code",
        ".rb": "code",
        ".go": "code",
        ".rs": "code",
        ".swift": "code",
        ".kt": "code",
        ".sql": "code",
        ".sh": "code",
        ".bash": "code",
        ".md": "code",
        ".rst": "code",
        ".yaml": "code",
        ".yml": "code",
        ".toml": "code",
        
        # Documentos
        ".pdf": "document",
        ".docx": "document",
        ".doc": "document",
        ".pptx": "document",
        ".ppt": "document",
        ".odt": "document",
        ".rtf": "document"
    }
    
    def __init__(self):
        """Inicializar Chunking Manager"""
        self._splitters = {}
    
    def get_strategy_for_file(self, file_path: str) -> str:
        """
        Determinar estrategia de chunking para un archivo
        
        Args:
            file_path: Ruta del archivo
            
        Returns:
            Nombre de la estrategia ("text", "code", "document")
        """
        ext = Path(file_path).suffix.lower()
        strategy = self.EXTENSION_MAP.get(ext, "text")
        
        logger.debug(f"Archivo {Path(file_path).name} → estrategia '{strategy}'")
        
        return strategy
    
    def get_splitter(self, strategy: str) -> RecursiveCharacterTextSplitter:
        """
        Obtener text splitter para una estrategia
        
        Args:
            strategy: Nombre de la estrategia
            
        Returns:
            Instancia de RecursiveCharacterTextSplitter
        """
        if strategy in self._splitters:
            return self._splitters[strategy]
        
        if strategy not in self.STRATEGIES:
            logger.warning(f"Estrategia '{strategy}' no encontrada, usando 'text'")
            strategy = "text"
        
        config = self.STRATEGIES[strategy]
        
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
            separators=config.separators,
            add_start_index=True,
            keep_separator=True
        )
        
        self._splitters[strategy] = splitter
        
        logger.info(
            f"Splitter creado para '{strategy}': "
            f"chunk_size={config.chunk_size}, overlap={config.chunk_overlap}"
        )
        
        return splitter
    
    def split_documents_adaptive(
        self,
        documents: List[Document]
    ) -> List[Document]:
        """
        Dividir documentos usando chunking adaptativo
        
        Args:
            documents: Lista de documentos a dividir
            
        Returns:
            Lista de documentos divididos en chunks
        """
        all_splits = []
        strategy_counts = {"text": 0, "code": 0, "document": 0}
        
        logger.info(f"Iniciando chunking adaptativo de {len(documents)} documentos")
        
        for doc in documents:
            # Determinar estrategia segun la fuente
            source = doc.metadata.get('source', '')
            strategy = self.get_strategy_for_file(source)
            strategy_counts[strategy] += 1
            
            # Obtener splitter apropiado
            splitter = self.get_splitter(strategy)
            
            # Dividir documento
            splits = splitter.split_documents([doc])
            
            # Agregar metadata de estrategia
            for split in splits:
                split.metadata['chunking_strategy'] = strategy
            
            all_splits.extend(splits)
        
        logger.info(f"Chunking completado:")
        logger.info(f"  Total documentos: {len(documents)}")
        logger.info(f"  Total chunks: {len(all_splits)}")
        logger.info(f"  Estrategias usadas:")
        for strategy, count in strategy_counts.items():
            if count > 0:
                config = self.STRATEGIES[strategy]
                logger.info(
                    f"    - {strategy}: {count} docs "
                    f"(chunk_size={config.chunk_size}, overlap={config.chunk_overlap})"
                )
        
        return all_splits
    
    def get_strategy_info(self, strategy: str) -> Optional[Dict]:
        """
        Obtener informacion de una estrategia
        
        Args:
            strategy: Nombre de la estrategia
            
        Returns:
            Dict con configuracion de la estrategia
        """
        if strategy not in self.STRATEGIES:
            return None
        
        config = self.STRATEGIES[strategy]
        
        return {
            'chunk_size': config.chunk_size,
            'chunk_overlap': config.chunk_overlap,
            'separators': config.separators,
            'description': config.description
        }
    
    def list_strategies(self) -> Dict[str, Dict]:
        """
        Listar todas las estrategias disponibles
        
        Returns:
            Dict con todas las estrategias
        """
        return {
            name: self.get_strategy_info(name)
            for name in self.STRATEGIES.keys()
        }
    
    def get_stats(self) -> Dict:
        """
        Obtener estadisticas de chunking
        
        Returns:
            Dict con estadisticas
        """
        return {
            'strategies_available': len(self.STRATEGIES),
            'splitters_cached': len(self._splitters),
            'extensions_mapped': len(self.EXTENSION_MAP)
        }


def get_chunking_manager() -> ChunkingManager:
    """
    Obtener instancia singleton de ChunkingManager
    
    Returns:
        Instancia de ChunkingManager
    """
    if not hasattr(get_chunking_manager, '_instance'):
        get_chunking_manager._instance = ChunkingManager()
    
    return get_chunking_manager._instance
