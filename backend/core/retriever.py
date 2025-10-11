"""
Retriever - Busquedas vectoriales con ranking semantico
Implementa recuperacion avanzada y reranking de resultados
"""

import asyncio
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass

from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import EmbeddingsFilter

from utils.logger import get_logger

logger = get_logger("retriever")


@dataclass
class RetrievalResult:
    """Resultado de una busqueda vectorial"""
    documents: List[Document]
    scores: List[float]
    query: str
    total_results: int
    filtered_results: int
    retrieval_time: float


class SemanticRetriever:
    """
    Retriever con busqueda vectorial y ranking semantico
    Soporta busquedas asincronas y paralelas
    """
    
    def __init__(
        self,
        vectorstore: Chroma,
        default_k: int = 10,
        score_threshold: float = 0.0,  # Threshold mas bajo por defecto
        use_mmr: bool = False,
        mmr_diversity: float = 0.3
    ):
        """
        Inicializar Semantic Retriever
        
        Args:
            vectorstore: Instancia de Chroma vectorstore
            default_k: Numero por defecto de documentos a recuperar
            score_threshold: Umbral minimo de similitud (0-1)
            use_mmr: Usar Maximum Marginal Relevance para diversidad
            mmr_diversity: Factor de diversidad para MMR (0=relevancia, 1=diversidad)
        """
        self.vectorstore = vectorstore
        self.default_k = default_k
        self.score_threshold = score_threshold
        self.use_mmr = use_mmr
        self.mmr_diversity = mmr_diversity
        
        # Configuracion de retrieval
        self._base_retriever = None
    
    def _mmr_search_with_scores(
        self,
        query: str,
        k: int,
        fetch_k: int,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[Document, float]]:
        """
        Realizar busqueda MMR y aproximar scores
        
        Args:
            query: Query de busqueda
            k: Documentos finales a retornar
            fetch_k: Documentos a recuperar antes de aplicar MMR
            filter_metadata: Filtros de metadata
            
        Returns:
            Lista de tuplas (documento, score)
        """
        # Primero obtener candidatos con scores
        candidates_with_scores = self.vectorstore.similarity_search_with_score(
            query,
            k=fetch_k,
            filter=filter_metadata
        )
        
        # Aplicar MMR manualmente usando los candidatos
        # ChromaDB no expone max_marginal_relevance_search_with_score directamente
        # pero podemos usar el metodo max_marginal_relevance_search y mapear scores
        
        logger.info(f"MMR: Buscando {k} docs finales de {fetch_k} candidatos (diversity={self.mmr_diversity})")
        
        mmr_docs = self.vectorstore.max_marginal_relevance_search(
            query,
            k=k,
            fetch_k=fetch_k,
            lambda_mult=1 - self.mmr_diversity,
            filter=filter_metadata
        )
        
        logger.info(f"MMR: Obtenidos {len(mmr_docs)} documentos, {len(candidates_with_scores)} candidatos con scores")
        
        # Mapear documentos MMR con sus scores originales
        score_map = {doc.page_content: score for doc, score in candidates_with_scores}
        
        results = []
        matched = 0
        for doc in mmr_docs:
            # Usar score del candidato original si existe, sino usar score promedio
            if doc.page_content in score_map:
                score = score_map[doc.page_content]
                matched += 1
            else:
                score = 0.5
            results.append((doc, score))
        
        logger.info(f"MMR: {matched}/{len(mmr_docs)} documentos con score mapeado correctamente")
        
        return results
    
    def _get_base_retriever(self, k: int) -> BaseRetriever:
        """
        Obtener retriever base configurado
        
        Args:
            k: Numero de documentos a recuperar
            
        Returns:
            Instancia de retriever
        """
        search_type = "mmr" if self.use_mmr else "similarity"
        
        search_kwargs = {
            "k": k,
        }
        
        if self.use_mmr:
            search_kwargs["lambda_mult"] = 1 - self.mmr_diversity
        
        return self.vectorstore.as_retriever(
            search_type=search_type,
            search_kwargs=search_kwargs
        )
    
    async def retrieve_async(
        self,
        query: str,
        k: Optional[int] = None,
        fetch_k: Optional[int] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
        score_threshold: Optional[float] = None
    ) -> RetrievalResult:
        """
        Realizar busqueda vectorial asincrona
        
        Args:
            query: Query de busqueda
            k: Numero de documentos a recuperar
            fetch_k: Numero de documentos a recuperar antes de filtrar (para MMR)
            filter_metadata: Filtros de metadata para aplicar
            score_threshold: Umbral de similitud personalizado
            
        Returns:
            RetrievalResult con documentos y scores
        """
        import time
        start_time = time.time()
        
        k = k or self.default_k
        fetch_k = fetch_k or (k * 5)  # Por defecto, fetch 5x mas para tener pool
        threshold = score_threshold or self.score_threshold
        
        logger.info(f"Buscando documentos para query: '{query[:50]}...'")
        logger.info(f"Parametros: k={k}, fetch_k={fetch_k}, threshold={threshold}, use_mmr={self.use_mmr}")
        
        try:
            # Realizar busqueda segun configuracion
            if self.use_mmr:
                # MMR search (devuelve solo documentos, sin scores directos)
                docs_with_scores = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self._mmr_search_with_scores(query, k, fetch_k, filter_metadata)
                )
                results = docs_with_scores
            else:
                # Similarity search con scores
                results = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.vectorstore.similarity_search_with_score(
                        query,
                        k=fetch_k,  # Recuperar mas documentos inicialmente
                        filter=filter_metadata
                    )
                )
            
            # Separar documentos y scores
            documents = []
            scores = []
            
            for doc, score in results:
                # ChromaDB usa distancia (menor es mejor)
                # Convertir a similitud (mayor es mejor)
                similarity = 1 / (1 + score)
                
                if similarity >= threshold:
                    documents.append(doc)
                    scores.append(similarity)
            
            # Limitar a k documentos finales (despues de filtrar por threshold)
            if len(documents) > k:
                # Ordenar por score descendente y tomar los mejores k
                sorted_pairs = sorted(zip(documents, scores), key=lambda x: x[1], reverse=True)
                documents = [doc for doc, _ in sorted_pairs[:k]]
                scores = [score for _, score in sorted_pairs[:k]]
            
            retrieval_time = time.time() - start_time
            
            logger.info(f"Recuperados {len(documents)}/{len(results)} documentos (filtrados por threshold={threshold})")
            
            result = RetrievalResult(
                documents=documents,
                scores=scores,
                query=query,
                total_results=len(results),
                filtered_results=len(documents),
                retrieval_time=retrieval_time
            )
            
            logger.info(
                f"Busqueda completada: {result.filtered_results}/{result.total_results} "
                f"documentos (threshold={threshold:.2f}, tiempo={retrieval_time:.3f}s)"
            )
            
            return result
        
        except Exception as e:
            logger.error(f"Error en busqueda vectorial: {e}")
            raise
    
    def retrieve_sync(
        self,
        query: str,
        k: Optional[int] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
        score_threshold: Optional[float] = None
    ) -> RetrievalResult:
        """
        Realizar busqueda vectorial sincrona
        
        Args:
            query: Query de busqueda
            k: Numero de documentos a recuperar
            filter_metadata: Filtros de metadata
            score_threshold: Umbral de similitud personalizado
            
        Returns:
            RetrievalResult con documentos y scores
        """
        import time
        start_time = time.time()
        
        k = k or self.default_k
        threshold = score_threshold or self.score_threshold
        
        logger.info(f"Buscando documentos para query: '{query[:50]}...'")
        
        try:
            results = self.vectorstore.similarity_search_with_score(
                query,
                k=k,
                filter=filter_metadata
            )
            
            documents = []
            scores = []
            
            for doc, score in results:
                similarity = 1 / (1 + score)
                
                if similarity >= threshold:
                    documents.append(doc)
                    scores.append(similarity)
            
            retrieval_time = time.time() - start_time
            
            result = RetrievalResult(
                documents=documents,
                scores=scores,
                query=query,
                total_results=len(results),
                filtered_results=len(documents),
                retrieval_time=retrieval_time
            )
            
            logger.info(
                f"Busqueda completada: {result.filtered_results}/{result.total_results} "
                f"documentos (tiempo={retrieval_time:.3f}s)"
            )
            
            return result
        
        except Exception as e:
            logger.error(f"Error en busqueda vectorial: {e}")
            raise
    
    async def retrieve_multiple_async(
        self,
        queries: List[str],
        k: Optional[int] = None
    ) -> List[RetrievalResult]:
        """
        Realizar multiples busquedas en paralelo
        
        Args:
            queries: Lista de queries a buscar
            k: Numero de documentos por query
            
        Returns:
            Lista de RetrievalResult
        """
        logger.info(f"Realizando {len(queries)} busquedas en paralelo")
        
        tasks = [
            self.retrieve_async(query, k)
            for query in queries
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filtrar errores
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error en query {i}: {result}")
            else:
                valid_results.append(result)
        
        logger.info(f"Completadas {len(valid_results)}/{len(queries)} busquedas exitosamente")
        
        return valid_results
    
    def rerank_by_relevance(
        self,
        documents: List[Document],
        scores: List[float],
        top_k: int = 5
    ) -> Tuple[List[Document], List[float]]:
        """
        Reordenar documentos por relevancia
        
        Args:
            documents: Lista de documentos
            scores: Lista de scores correspondientes
            top_k: Numero de documentos top a retornar
            
        Returns:
            Tupla (documentos_reordenados, scores_reordenados)
        """
        if not documents:
            return [], []
        
        # Combinar documentos con scores y ordenar
        doc_score_pairs = list(zip(documents, scores))
        doc_score_pairs.sort(key=lambda x: x[1], reverse=True)
        
        # Tomar top_k
        top_pairs = doc_score_pairs[:top_k]
        
        reranked_docs = [doc for doc, _ in top_pairs]
        reranked_scores = [score for _, score in top_pairs]
        
        logger.info(f"Reranking: {len(documents)} -> {len(reranked_docs)} documentos")
        
        return reranked_docs, reranked_scores
    
    def deduplicate_documents(
        self,
        documents: List[Document],
        scores: List[float]
    ) -> Tuple[List[Document], List[float]]:
        """
        Eliminar documentos duplicados basado en contenido
        
        Args:
            documents: Lista de documentos
            scores: Lista de scores correspondientes
            
        Returns:
            Tupla (documentos_unicos, scores_unicos)
        """
        seen_content = set()
        unique_docs = []
        unique_scores = []
        
        for doc, score in zip(documents, scores):
            content_hash = hash(doc.page_content)
            
            if content_hash not in seen_content:
                seen_content.add(content_hash)
                unique_docs.append(doc)
                unique_scores.append(score)
        
        logger.info(f"Deduplicacion: {len(documents)} -> {len(unique_docs)} documentos")
        
        return unique_docs, unique_scores
    
    def filter_by_metadata(
        self,
        documents: List[Document],
        scores: List[float],
        metadata_filters: Dict[str, Any]
    ) -> Tuple[List[Document], List[float]]:
        """
        Filtrar documentos por metadata
        
        Args:
            documents: Lista de documentos
            scores: Lista de scores
            metadata_filters: Dict con filtros {key: value}
            
        Returns:
            Tupla (documentos_filtrados, scores_filtrados)
        """
        filtered_docs = []
        filtered_scores = []
        
        for doc, score in zip(documents, scores):
            match = all(
                doc.metadata.get(key) == value
                for key, value in metadata_filters.items()
            )
            
            if match:
                filtered_docs.append(doc)
                filtered_scores.append(score)
        
        logger.info(f"Filtrado por metadata: {len(documents)} -> {len(filtered_docs)} documentos")
        
        return filtered_docs, filtered_scores
    
    def get_context_string(
        self,
        documents: List[Document],
        include_metadata: bool = True,
        max_length: Optional[int] = None
    ) -> str:
        """
        Generar string de contexto para LLM
        
        Args:
            documents: Lista de documentos recuperados
            include_metadata: Incluir metadata en el contexto
            max_length: Longitud maxima del contexto (opcional)
            
        Returns:
            String de contexto formateado
        """
        context_parts = []
        
        for i, doc in enumerate(documents, 1):
            part = f"[Fragmento {i}]\n"
            
            if include_metadata:
                source = doc.metadata.get('source', 'desconocido')
                part += f"Fuente: {source}\n"
            
            part += f"{doc.page_content}\n"
            
            context_parts.append(part)
        
        context = "\n".join(context_parts)
        
        # Truncar si es necesario
        if max_length and len(context) > max_length:
            context = context[:max_length] + "...\n[Contexto truncado]"
        
        return context
    
    def update_config(
        self,
        default_k: Optional[int] = None,
        score_threshold: Optional[float] = None,
        use_mmr: Optional[bool] = None,
        mmr_diversity: Optional[float] = None
    ):
        """
        Actualizar configuracion del retriever
        
        Args:
            default_k: Nuevo k por defecto
            score_threshold: Nuevo umbral de similitud
            use_mmr: Activar/desactivar MMR
            mmr_diversity: Nuevo factor de diversidad
        """
        if default_k is not None:
            self.default_k = default_k
            logger.info(f"default_k actualizado: {default_k}")
        
        if score_threshold is not None:
            self.score_threshold = score_threshold
            logger.info(f"score_threshold actualizado: {score_threshold}")
        
        if use_mmr is not None:
            self.use_mmr = use_mmr
            logger.info(f"use_mmr actualizado: {use_mmr}")
        
        if mmr_diversity is not None:
            self.mmr_diversity = mmr_diversity
            logger.info(f"mmr_diversity actualizado: {mmr_diversity}")


class HybridRetriever:
    """
    Retriever hibrido que combina busqueda vectorial con keyword search
    """
    
    def __init__(
        self,
        semantic_retriever: SemanticRetriever,
        vector_weight: float = 0.7,
        keyword_weight: float = 0.3
    ):
        """
        Inicializar Hybrid Retriever
        
        Args:
            semantic_retriever: Instancia de SemanticRetriever
            vector_weight: Peso para resultados vectoriales (0-1)
            keyword_weight: Peso para resultados de keyword search (0-1)
        """
        self.semantic_retriever = semantic_retriever
        self.vector_weight = vector_weight
        self.keyword_weight = keyword_weight
        
        # Normalizar pesos
        total = vector_weight + keyword_weight
        self.vector_weight = vector_weight / total
        self.keyword_weight = keyword_weight / total
        
        logger.info(
            f"Hybrid Retriever: vector_weight={self.vector_weight:.2f}, "
            f"keyword_weight={self.keyword_weight:.2f}"
        )
    
    async def retrieve_hybrid(
        self,
        query: str,
        k: int = 10
    ) -> RetrievalResult:
        """
        Busqueda hibrida combinando vectorial y keyword
        
        Args:
            query: Query de busqueda
            k: Numero total de documentos a retornar
            
        Returns:
            RetrievalResult con documentos combinados
        """
        # Por ahora solo usar semantic retriever
        # En el futuro se puede agregar BM25 o keyword search
        result = await self.semantic_retriever.retrieve_async(query, k)
        
        return result
