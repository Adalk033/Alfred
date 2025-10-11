"""
Embedding Cache - Cache LRU para embeddings frecuentes
Evita recalcular embeddings de queries repetidas
"""

from functools import lru_cache
from typing import List
import hashlib


class EmbeddingCache:
    """Cache para queries frecuentes"""
    
    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self._cache = {}
        self._access_order = []
    
    def _hash_query(self, query: str) -> str:
        """Generar hash de query"""
        return hashlib.md5(query.encode('utf-8')).hexdigest()
    
    def get(self, query: str) -> List[float] | None:
        """Obtener embedding desde cache"""
        key = self._hash_query(query)
        if key in self._cache:
            # Actualizar orden de acceso (LRU)
            self._access_order.remove(key)
            self._access_order.append(key)
            return self._cache[key]
        return None
    
    def set(self, query: str, embedding: List[float]):
        """Guardar embedding en cache"""
        key = self._hash_query(query)
        
        # Si cache lleno, eliminar el menos usado
        if len(self._cache) >= self.max_size:
            oldest_key = self._access_order.pop(0)
            del self._cache[oldest_key]
        
        self._cache[key] = embedding
        self._access_order.append(key)
    
    def clear(self):
        """Limpiar cache"""
        self._cache.clear()
        self._access_order.clear()
