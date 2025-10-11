"""
Retrieval Cache - Cache LRU para resultados de busqueda con TTL
Optimiza busquedas frecuentes almacenando resultados en memoria
"""

import time
import hashlib
from typing import List, Optional, Dict, Any, Tuple
from functools import lru_cache
from dataclasses import dataclass
from threading import Lock

from langchain_core.documents import Document

from utils.logger import get_logger

logger = get_logger("retrieval_cache")


@dataclass
class CacheEntry:
    """Entrada de cache con timestamp y TTL"""
    documents: List[Document]
    scores: List[float]
    timestamp: float
    query_hash: str
    hit_count: int = 0


class RetrievalCache:
    """
    Cache LRU para resultados de retrieval con TTL
    """
    
    def __init__(
        self,
        max_size: int = 100,
        ttl_seconds: int = 1800  # 30 minutos
    ):
        """
        Inicializar cache
        
        Args:
            max_size: Numero maximo de entradas en cache
            ttl_seconds: Tiempo de vida en segundos (default: 30 min)
        """
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[str, CacheEntry] = {}
        self._access_order: List[str] = []  # Para LRU
        self._lock = Lock()
        
        # Estadisticas
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        self._expirations = 0
        
        logger.info(
            f"Cache de retrieval inicializado: "
            f"max_size={max_size}, TTL={ttl_seconds}s ({ttl_seconds/60:.1f} min)"
        )
    
    def _generate_query_hash(self, query: str, **kwargs) -> str:
        """
        Generar hash unico para una query
        
        Args:
            query: Query de busqueda
            **kwargs: Parametros adicionales (k, threshold, etc.)
            
        Returns:
            Hash SHA256 como string
        """
        # Incluir query y parametros relevantes en el hash
        cache_key = f"{query}:{sorted(kwargs.items())}"
        return hashlib.sha256(cache_key.encode()).hexdigest()
    
    def _is_expired(self, entry: CacheEntry) -> bool:
        """
        Verificar si una entrada ha expirado
        
        Args:
            entry: Entrada de cache
            
        Returns:
            True si ha expirado
        """
        age = time.time() - entry.timestamp
        return age > self.ttl_seconds
    
    def _evict_lru(self):
        """Eliminar entrada menos recientemente usada"""
        if not self._access_order:
            return
        
        # Obtener la entrada mas antigua
        lru_key = self._access_order.pop(0)
        
        if lru_key in self._cache:
            del self._cache[lru_key]
            self._evictions += 1
            logger.debug(f"Entrada LRU evicted: {lru_key[:8]}...")
    
    def _cleanup_expired(self):
        """Eliminar entradas expiradas"""
        expired_keys = []
        
        for key, entry in self._cache.items():
            if self._is_expired(entry):
                expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
            if key in self._access_order:
                self._access_order.remove(key)
            self._expirations += 1
        
        if expired_keys:
            logger.debug(f"Eliminadas {len(expired_keys)} entradas expiradas")
    
    def get(
        self,
        query: str,
        **kwargs
    ) -> Optional[Tuple[List[Document], List[float]]]:
        """
        Obtener resultado de cache si existe y es valido
        
        Args:
            query: Query de busqueda
            **kwargs: Parametros adicionales
            
        Returns:
            Tupla (documents, scores) o None si no esta en cache
        """
        query_hash = self._generate_query_hash(query, **kwargs)
        
        with self._lock:
            # Limpiar entradas expiradas periodicamente
            if len(self._cache) > 0 and self._hits + self._misses % 10 == 0:
                self._cleanup_expired()
            
            if query_hash in self._cache:
                entry = self._cache[query_hash]
                
                # Verificar si ha expirado
                if self._is_expired(entry):
                    logger.debug(f"Cache entry expired: {query[:50]}...")
                    del self._cache[query_hash]
                    if query_hash in self._access_order:
                        self._access_order.remove(query_hash)
                    self._expirations += 1
                    self._misses += 1
                    return None
                
                # Hit!
                self._hits += 1
                entry.hit_count += 1
                
                # Actualizar orden LRU
                if query_hash in self._access_order:
                    self._access_order.remove(query_hash)
                self._access_order.append(query_hash)
                
                age = time.time() - entry.timestamp
                logger.info(
                    f"Cache HIT: '{query[:50]}...' "
                    f"(age={age:.1f}s, hits={entry.hit_count})"
                )
                
                return entry.documents, entry.scores
            
            # Miss
            self._misses += 1
            logger.debug(f"Cache MISS: '{query[:50]}...'")
            return None
    
    def put(
        self,
        query: str,
        documents: List[Document],
        scores: List[float],
        **kwargs
    ):
        """
        Guardar resultado en cache
        
        Args:
            query: Query de busqueda
            documents: Documentos recuperados
            scores: Scores correspondientes
            **kwargs: Parametros adicionales
        """
        query_hash = self._generate_query_hash(query, **kwargs)
        
        with self._lock:
            # Si el cache esta lleno, eliminar LRU
            if len(self._cache) >= self.max_size and query_hash not in self._cache:
                self._evict_lru()
            
            # Crear entrada
            entry = CacheEntry(
                documents=documents,
                scores=scores,
                timestamp=time.time(),
                query_hash=query_hash
            )
            
            # Guardar
            self._cache[query_hash] = entry
            
            # Actualizar orden LRU
            if query_hash in self._access_order:
                self._access_order.remove(query_hash)
            self._access_order.append(query_hash)
            
            logger.debug(
                f"Cache PUT: '{query[:50]}...' "
                f"({len(documents)} docs, cache_size={len(self._cache)})"
            )
    
    def invalidate(self, query: Optional[str] = None):
        """
        Invalidar cache completo o una query especifica
        
        Args:
            query: Query especifica a invalidar (None = todas)
        """
        with self._lock:
            if query is None:
                # Invalidar todo
                count = len(self._cache)
                self._cache.clear()
                self._access_order.clear()
                logger.info(f"Cache invalidado completamente ({count} entradas)")
            else:
                # Invalidar query especifica
                # Necesitamos probar con diferentes kwargs
                keys_to_remove = [
                    key for key in self._cache.keys()
                    if query in self._cache[key].query_hash
                ]
                
                for key in keys_to_remove:
                    del self._cache[key]
                    if key in self._access_order:
                        self._access_order.remove(key)
                
                if keys_to_remove:
                    logger.info(f"Invalidadas {len(keys_to_remove)} entradas para query")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Obtener estadisticas de cache
        
        Returns:
            Dict con estadisticas
        """
        total_requests = self._hits + self._misses
        hit_rate = (self._hits / total_requests * 100) if total_requests > 0 else 0
        
        with self._lock:
            # Calcular tamano promedio de entradas
            total_docs = sum(len(entry.documents) for entry in self._cache.values())
            avg_docs = total_docs / len(self._cache) if self._cache else 0
            
            # Calcular edad promedio
            current_time = time.time()
            ages = [current_time - entry.timestamp for entry in self._cache.values()]
            avg_age = sum(ages) / len(ages) if ages else 0
            
            return {
                'hits': self._hits,
                'misses': self._misses,
                'total_requests': total_requests,
                'hit_rate_percent': round(hit_rate, 2),
                'cache_size': len(self._cache),
                'max_size': self.max_size,
                'ttl_seconds': self.ttl_seconds,
                'evictions': self._evictions,
                'expirations': self._expirations,
                'avg_documents_per_entry': round(avg_docs, 1),
                'avg_age_seconds': round(avg_age, 1)
            }
    
    def print_stats(self):
        """Imprimir estadisticas formateadas"""
        stats = self.get_stats()
        
        print("\n" + "="*50)
        print("ESTADISTICAS DE CACHE DE RETRIEVAL")
        print("="*50)
        print(f"Solicitudes totales: {stats['total_requests']}")
        print(f"  Hits: {stats['hits']}")
        print(f"  Misses: {stats['misses']}")
        print(f"  Hit rate: {stats['hit_rate_percent']:.2f}%")
        print(f"\nCache:")
        print(f"  Tamano actual: {stats['cache_size']}/{stats['max_size']}")
        print(f"  TTL: {stats['ttl_seconds']}s ({stats['ttl_seconds']/60:.1f} min)")
        print(f"  Evictions: {stats['evictions']}")
        print(f"  Expiraciones: {stats['expirations']}")
        print(f"\nContenido:")
        print(f"  Docs promedio/entrada: {stats['avg_documents_per_entry']:.1f}")
        print(f"  Edad promedio: {stats['avg_age_seconds']:.1f}s")
        print("="*50)
    
    def clear(self):
        """Limpiar cache y reiniciar estadisticas"""
        with self._lock:
            self._cache.clear()
            self._access_order.clear()
            self._hits = 0
            self._misses = 0
            self._evictions = 0
            self._expirations = 0
        
        logger.info("Cache limpiado y estadisticas reiniciadas")


def get_retrieval_cache(
    max_size: int = 100,
    ttl_seconds: int = 1800
) -> RetrievalCache:
    """
    Obtener instancia singleton de RetrievalCache
    
    Args:
        max_size: Tamano maximo del cache
        ttl_seconds: Tiempo de vida en segundos
        
    Returns:
        Instancia de RetrievalCache
    """
    if not hasattr(get_retrieval_cache, '_instance'):
        get_retrieval_cache._instance = RetrievalCache(max_size, ttl_seconds)
    
    return get_retrieval_cache._instance
