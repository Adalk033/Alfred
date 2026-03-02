"""
Embedding Manager - Seleccion y optimizacion de modelos de embeddings
Detecta VRAM disponible y elige el mejor modelo automaticamente
"""

import os
from typing import Optional, Dict, Any
from dataclasses import dataclass

from langchain_ollama import OllamaEmbeddings
from utils.logger import get_logger

logger = get_logger("embedding_manager")


@dataclass
class EmbeddingModelConfig:
    """Configuracion de un modelo de embeddings"""
    name: str
    ollama_name: str
    dimension: int
    vram_required_gb: float
    speed: str  # "fast", "medium", "slow"
    quality: str  # "high", "medium", "low"
    best_for: str
    description: str


class EmbeddingManager:
    """
    Gestor de modelos de embeddings con seleccion automatica
    """
    
    # Catalogo de modelos disponibles
    MODELS = {
        "nomic-embed-text": EmbeddingModelConfig(
            name="nomic-embed-text",
            ollama_name="nomic-embed-text:v1.5",
            dimension=768,
            vram_required_gb=2.0,
            speed="medium",
            quality="high",
            best_for="Textos generales, documentos variados",
            description="Modelo balanceado con buena precision general"
        ),
        "bge-large": EmbeddingModelConfig(
            name="bge-large",
            ollama_name="bge-large-en-v1.5",
            dimension=1024,
            vram_required_gb=8.0,
            speed="slow",
            quality="high",
            best_for="Textos tecnicos, codigo, documentacion",
            description="Mejor precision en textos tecnicos, requiere mas VRAM"
        ),
        "gte-small": EmbeddingModelConfig(
            name="gte-small",
            ollama_name="gte-small",
            dimension=384,
            vram_required_gb=1.0,
            speed="fast",
            quality="medium",
            best_for="Laptop, CPU, respuestas rapidas",
            description="Rapido y eficiente, ideal para dispositivos con recursos limitados"
        ),
        "minilm": EmbeddingModelConfig(
            name="minilm",
            ollama_name="all-minilm:l6-v2",
            dimension=384,
            vram_required_gb=0.5,
            speed="fast",
            quality="medium",
            best_for="CPU, dispositivos de bajo rendimiento",
            description="Muy rapido, minimo uso de memoria, calidad aceptable"
        ),
        "mxbai-embed-large": EmbeddingModelConfig(
            name="mxbai-embed-large",
            ollama_name="mxbai-embed-large:latest",
            dimension=1024,
            vram_required_gb=1.5,
            speed="fast",
            quality="high",
            best_for="Balance velocidad/precision, documentos personales",
            description="Rapido con precision alta, ideal para RAG local"
        )
    }
    
    def __init__(self, preferred_model: Optional[str] = None):
        """
        Inicializar Embedding Manager
        
        Args:
            preferred_model: Modelo preferido (si None, selecciona automaticamente)
        """
        self.preferred_model = preferred_model
        self._selected_model = None
        self._embeddings = None
        self._vram_available = None
    
    def get_available_vram(self) -> float:
        """
        Detectar VRAM disponible en GB
        
        Returns:
            VRAM disponible en GB (0 si solo CPU)
        """
        if self._vram_available is not None:
            return self._vram_available
        
        try:
            import torch
            if torch.cuda.is_available():
                gpu_props = torch.cuda.get_device_properties(0)
                total_vram_gb = gpu_props.total_memory / (1024**3)
                
                # Estimar VRAM libre (considerando overhead del sistema)
                torch.cuda.empty_cache()
                allocated_vram_gb = torch.cuda.memory_allocated(0) / (1024**3)
                free_vram_gb = total_vram_gb - allocated_vram_gb
                
                self._vram_available = free_vram_gb
                logger.info(f"VRAM detectada: {total_vram_gb:.2f}GB total, {free_vram_gb:.2f}GB libre")
                
                return free_vram_gb
        
        except ImportError:
            logger.info("PyTorch no disponible, asumiendo modo CPU")
        except Exception as e:
            logger.warning(f"Error detectando VRAM: {e}")
        
        self._vram_available = 0.0
        return 0.0
    
    def select_best_model(self) -> EmbeddingModelConfig:
        """
        Seleccionar el mejor modelo segun VRAM disponible
        
        Returns:
            Configuracion del modelo seleccionado
        """
        if self._selected_model:
            return self._selected_model
        
        # Si hay modelo preferido, usarlo SIEMPRE
        if self.preferred_model:
            # Intentar buscar por nombre de Ollama primero
            for key, model in self.MODELS.items():
                if model.ollama_name == self.preferred_model or key == self.preferred_model:
                    self._selected_model = model
                    logger.info(f"Usando modelo preferido: {self.preferred_model} -> {model.ollama_name}")
                    return self._selected_model
            
            logger.warning(f"Modelo preferido '{self.preferred_model}' no encontrado en catalogo")
        
        # Detectar VRAM disponible
        vram_gb = self.get_available_vram()
        
        # Por defecto usar nomic-embed-text (balanceado y confiable)
        selected = self.MODELS["nomic-embed-text"]
        
        # Seleccionar modelo segun VRAM
        # if vram_gb >= 8.0:
        #     # Suficiente VRAM para el mejor modelo
        #     selected = self.MODELS["bge-large"]
        #     logger.info(f"VRAM ≥ 8GB: seleccionando {selected.name} (mejor calidad)")
        
        # elif vram_gb >= 2.0:
        #     # VRAM moderada, usar modelo balanceado
        #     selected = self.MODELS["nomic-embed-text"]
        #     logger.info(f"VRAM ≥ 2GB: seleccionando {selected.name} (balanceado)")
        
        # elif vram_gb >= 1.0:
        #     # VRAM limitada, usar modelo pequeno
        #     selected = self.MODELS["gte-small"]
        #     logger.info(f"VRAM ≥ 1GB: seleccionando {selected.name} (rapido)")
        
        # else:
        #     # Solo CPU o VRAM muy limitada
        #     selected = self.MODELS["minilm"]
        #     logger.info(f"CPU o VRAM < 1GB: seleccionando {selected.name} (minimo)")
        
        self._selected_model = selected
        return selected
    
    def get_embeddings(self) -> OllamaEmbeddings:
        """
        Obtener instancia de embeddings del modelo seleccionado
        
        Returns:
            Instancia de OllamaEmbeddings
        """
        if self._embeddings is not None:
            return self._embeddings
        
        model_config = self.select_best_model()
        
        logger.info(f"Inicializando embeddings: {model_config.ollama_name}")
        logger.info(f"  Dimension: {model_config.dimension}")
        logger.info(f"  Velocidad: {model_config.speed}")
        logger.info(f"  Calidad: {model_config.quality}")
        logger.info(f"  Mejor para: {model_config.best_for}")
        
        self._embeddings = OllamaEmbeddings(model=model_config.ollama_name)
        
        return self._embeddings
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Obtener informacion del modelo seleccionado
        
        Returns:
            Dict con informacion del modelo
        """
        model_config = self.select_best_model()
        
        return {
            'name': model_config.name,
            'ollama_name': model_config.ollama_name,
            'dimension': model_config.dimension,
            'vram_required_gb': model_config.vram_required_gb,
            'vram_available_gb': self.get_available_vram(),
            'speed': model_config.speed,
            'quality': model_config.quality,
            'best_for': model_config.best_for,
            'description': model_config.description
        }
    
    def list_available_models(self) -> Dict[str, EmbeddingModelConfig]:
        """
        Listar todos los modelos disponibles
        
        Returns:
            Dict con todos los modelos
        """
        return self.MODELS.copy()
    
    def change_model(self, model_name: str) -> bool:
        """
        Cambiar a un modelo diferente
        
        Args:
            model_name: Nombre del nuevo modelo
            
        Returns:
            True si se cambio exitosamente
        """
        if model_name not in self.MODELS:
            logger.error(f"Modelo '{model_name}' no encontrado")
            return False
        
        model_config = self.MODELS[model_name]
        vram_available = self.get_available_vram()
        
        if vram_available < model_config.vram_required_gb and vram_available > 0:
            logger.warning(
                f"VRAM insuficiente para {model_name}: "
                f"requiere {model_config.vram_required_gb}GB, "
                f"disponible {vram_available:.2f}GB"
            )
        
        self._selected_model = model_config
        self._embeddings = None  # Forzar reinicializacion
        
        logger.info(f"Modelo cambiado a: {model_name}")
        return True


def get_embedding_manager(preferred_model: Optional[str] = None) -> EmbeddingManager:
    """
    Obtener instancia singleton de EmbeddingManager
    
    Args:
        preferred_model: Modelo preferido (opcional)
        
    Returns:
        Instancia de EmbeddingManager
    """
    if not hasattr(get_embedding_manager, '_instance'):
        get_embedding_manager._instance = EmbeddingManager(preferred_model)
    elif preferred_model and preferred_model != get_embedding_manager._instance.preferred_model:
        # Actualizar modelo preferido si cambio
        logger.info(f"Actualizando modelo preferido de {get_embedding_manager._instance.preferred_model} a {preferred_model}")
        get_embedding_manager._instance.preferred_model = preferred_model
        get_embedding_manager._instance._selected_model = None
        get_embedding_manager._instance._embeddings = None
    
    return get_embedding_manager._instance
