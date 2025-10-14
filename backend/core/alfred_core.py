"""
Alfred Core (Refactorizado) - Logica de negocio con arquitectura asincrona
Integra los nuevos modulos: document_loader, vector_manager, retriever
Implementa lazy loading y procesamiento asincrono
"""

import os
import asyncio
from pathlib import Path
from typing import Dict, Optional, Any, List
from dotenv import load_dotenv
from datetime import datetime

from langchain_ollama import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate

import config
import functionsToHistory
# gpu_manager se importara de forma lazy para evitar errores con PyTorch en Windows
from vector_manager import VectorManager
from retriever import SemanticRetriever
from utils.logger import get_logger

logger = get_logger("alfred_core")


def get_current_datetime_spanish() -> str:
    """
    Obtener la fecha y hora actual formateada en espanol
    
    Returns:
        String con fecha y hora en formato legible en espanol
    """
    dias = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
    meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
             'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    
    now = datetime.now()
    dia_semana = dias[now.weekday()]
    dia = now.day
    mes = meses[now.month - 1]
    año = now.year
    hora = now.strftime("%H:%M:%S")
    
    return f"{dia_semana}, {dia} de {mes} de {año}, {hora}"


def get_user_personalization() -> dict:
    """
    Obtener toda la configuracion de personalizacion del usuario desde BD
    
    Returns:
        Diccionario con todos los campos de personalizacion
    """
    from db_manager import get_user_setting
    
    return {
        'user_name': get_user_setting('user_name', default='Usuario'),
        'user_age': get_user_setting('user_age', default='No especificada'),
        'assistant_name': get_user_setting('assistant_name', default='Alfred'),
        'custom_instructions': get_user_setting('custom_instructions', default='Ninguna instruccion personalizada.'),
        'user_occupation': get_user_setting('user_occupation', default='No especificada'),
        'about_user': get_user_setting('about_user', default='No especificado')
    }


class AlfredCore:
    """
    Nucleo refactorizado del asistente Alfred
    Implementa lazy loading, procesamiento asincrono e indexacion incremental
    """
    
    def __init__(self):
        """Inicializar Alfred Core con lazy loading"""
        load_dotenv()
        
        # Configuracion desde variables de entorno (valores por defecto)
        # Las rutas de documentos ahora se gestionan desde la base de datos
        self.chroma_db_path = os.getenv('ALFRED_CHROMA_PATH', './chroma_db')
        self.force_reload = os.getenv('ALFRED_FORCE_RELOAD', 'false').lower() == 'true'
        # qa_history_file OBSOLETO - ahora se usa SQLite (db_manager.py)
        
        # Obtener nombre y edad del usuario desde BD
        from db_manager import get_user_setting, init_db
        
        # Asegurar que BD este inicializada
        try:
            init_db()
        except:
            pass
        
        # Cargar nombre y edad del usuario desde BD
        self.user_name = get_user_setting('user_name', default='Usuario')
        self.user_age = get_user_setting('user_age', default='No especificada')
        
        # Modelo LLM: Prioridad BD > .env
        # Cargar desde base de datos si existe, sino desde .env
        from db_manager import get_model_setting, set_model_setting
        
        # Asegurar que BD este inicializada (por si acaso)
        try:
            init_db()
        except:
            pass  # BD ya existe
        
        env_model = os.getenv('ALFRED_MODEL', 'gemma2:9b')
        db_model = get_model_setting('last_used_model')
        
        if db_model:
            logger.info(f"Cargando modelo desde BD: {db_model}")
            self.model_name = db_model
        else:
            logger.info(f"No hay modelo en BD, usando .env: {env_model}")
            self.model_name = env_model
            # Guardar en BD para proximas ejecuciones
            set_model_setting('last_used_model', env_model)
        
        self.embedding_model = os.getenv('ALFRED_EMBEDDING_MODEL', 'nomic-embed-text:v1.5')
        
        # Cargar keep_alive desde BD (prioridad: BD > .env > default 30)
        from db_manager import get_user_setting
        db_keep_alive = get_user_setting('ollama_keep_alive', default=None, setting_type='int')
        if db_keep_alive:
            logger.info(f"Usando keep_alive desde BD: {db_keep_alive}s")
            self.ollama_keep_alive = db_keep_alive
        else:
            env_keep_alive = int(os.getenv('ALFRED_OLLAMA_KEEP_ALIVE', '30'))
            logger.info(f"No hay keep_alive en BD, usando .env: {env_keep_alive}s")
            self.ollama_keep_alive = env_keep_alive
            # Guardar en BD para proximas ejecuciones
            from db_manager import set_user_setting
            set_user_setting('ollama_keep_alive', env_keep_alive, 'int')
        
        logger.info("Sistema configurado para usar rutas de documentos gestionadas desde la base de datos")
        
        # Componentes lazy-loaded
        self._llm = None
        self._vector_manager = None
        self._retriever = None
        self._gpu_manager = None
        
        # Cache LRU simple para queries frecuentes
        self._query_cache = {}
        self._cache_max_size = int(os.getenv('ALFRED_CACHE_MAX_SIZE', '50'))
        self._cache_ttl_seconds = int(os.getenv('ALFRED_CACHE_TTL', '300'))  # 5 minutos
        self._cache_enabled = os.getenv('ALFRED_CACHE_ENABLED', 'true').lower() == 'true'
        
        # Estado interno
        self._initialized = False
        
        logger.info("Alfred Core creado (lazy loading habilitado)")
        if self._cache_enabled:
            logger.info(f"Cache LRU habilitado: max_size={self._cache_max_size}, ttl={self._cache_ttl_seconds}s")
    
    @property
    def gpu_manager(self):
        """Lazy loading del GPU manager"""
        if self._gpu_manager is None:
            logger.info("Inicializando GPU manager...")
            # Import lazy para evitar errores con PyTorch en Windows
            from gpu_manager import get_gpu_manager
            
            self._gpu_manager = get_gpu_manager()
            self._gpu_manager.configure_ollama_for_gpu()
            self._gpu_manager.optimize_for_inference()
            
            if self._gpu_manager.has_gpu:
                logger.info(f"GPU detectada: {self._gpu_manager.device_type}")
            else:
                logger.info("Modo CPU activo")
        
        return self._gpu_manager
    
    @property
    def llm(self) -> OllamaLLM:
        """Lazy loading del modelo LLM"""
        if self._llm is None:
            logger.info(f"Cargando modelo LLM: {self.model_name}")
            
            # Intentar configurar GPU si esta disponible
            if self._gpu_manager is None:
                try:
                    _ = self.gpu_manager
                except:
                    logger.info("GPU no disponible, LLM usara CPU")
            
            self._llm = OllamaLLM(
                model=self.model_name,
                keep_alive=self.ollama_keep_alive
            )
            logger.info(f"LLM cargado (keep_alive: {self.ollama_keep_alive}s)")
        
        return self._llm
    
    @property
    def vector_manager(self) -> VectorManager:
        """Lazy loading del vector manager"""
        if self._vector_manager is None:
            logger.info("Inicializando Vector Manager...")
            # Pasar None para chroma_db_path para que VectorManager use su lógica automática
            # que calcula la ruta correcta: AlfredElectron/chroma_db
            self._vector_manager = VectorManager(
                chroma_db_path=None,  # CORREGIDO: Usar lógica automática de VectorManager
                embedding_model=self.embedding_model
            )
        
        return self._vector_manager
    
    @property
    def retriever(self) -> SemanticRetriever:
        """Lazy loading del retriever"""
        if self._retriever is None:
            logger.info("Inicializando Semantic Retriever...")
            
            # Asegurar que vectorstore este inicializado
            vectorstore = self.vector_manager.get_vectorstore()
            
            if vectorstore is None:
                raise RuntimeError("Vectorstore no inicializado. Ejecutar initialize() primero")
            
            self._retriever = SemanticRetriever(
                vectorstore=vectorstore,
                default_k=20,  # Aumentado de 10 a 20 para mayor recall
                score_threshold=0.0,  # Sin threshold estricto, dejar que LLM filtre
                use_mmr=True,
                mmr_diversity=0.3
            )
        
        return self._retriever
    
    async def initialize_async(self):
        """
        Inicializacion asincrona completa de Alfred
        Realiza indexacion incremental de documentos
        """
        logger.info("="*60)
        logger.info("INICIALIZANDO ALFRED CORE (MODO ASYNC)")
        logger.info("="*60)
        logger.info(f"Usuario: {self.user_name}")
        logger.info(f"Modelo LLM: {self.model_name}")
        logger.info(f"Modelo Embeddings: {self.embedding_model}")
        logger.info(f"Sistema de rutas: Gestionado por usuario (no usa .env)")
        
        # 1. Inicializar GPU (opcional, puede fallar si PyTorch no esta instalado)
        try:
            _ = self.gpu_manager
            logger.info("GPU Manager inicializado")
        except Exception as e:
            logger.warning(f"GPU Manager no disponible, usando modo CPU: {str(e)[:100]}")
            self._gpu_manager = None
        
        # 2. Inicializar vectorstore
        logger.info("\nInicializando vectorstore...")
        vectorstore = self.vector_manager.initialize_vectorstore(force_reload=self.force_reload)
        
        # 3. Ya NO indexamos automaticamente - los documentos se indexan via endpoints
        # El usuario gestiona las rutas desde la UI y ejecuta reindexacion manual
        logger.info("\nSistema de indexacion: Manual via endpoints API")
        logger.info("Los documentos se indexan cuando el usuario ejecuta 'Reindexar' desde la UI")
        
        # 4. Inicializar retriever
        _ = self.retriever
        
        self._initialized = True
        
        logger.info("\n" + "="*60)
        logger.info("ALFRED CORE INICIALIZADO Y LISTO")
        logger.info("="*60)
    
    def initialize(self):
        """
        Inicializacion sincrona (wrapper para compatibilidad)
        """
        asyncio.run(self.initialize_async())
    
    async def query_async(
        self,
        question: str,
        use_history: bool = True,
        search_documents: bool = True,
        search_kwargs: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Procesar consulta de forma asincrona con cache LRU
        
        Args:
            question: Pregunta del usuario
            use_history: Buscar primero en historial
            search_documents: Buscar en documentos o solo usar prompt
            search_kwargs: Parametros adicionales de busqueda
            conversation_history: Historial de conversacion para contexto
            
        Returns:
            Dict con respuesta y metadata
        """
        if not self._initialized:
            raise RuntimeError("Alfred Core no esta inicializado")
        
        # 0. Verificar cache en memoria (si esta habilitado)
        if self._cache_enabled and search_documents:
            cache_key = hash(question.lower().strip())
            
            if cache_key in self._query_cache:
                cached_entry = self._query_cache[cache_key]
                elapsed = (datetime.now() - cached_entry['timestamp']).total_seconds()
                
                # Verificar TTL
                if elapsed < self._cache_ttl_seconds:
                    logger.info(f"Respuesta encontrada en cache (age={elapsed:.1f}s)")
                    result = cached_entry['result'].copy()
                    result['from_cache'] = True
                    result['cache_age_seconds'] = elapsed
                    return result
                else:
                    # Cache expirado, eliminar entrada
                    del self._query_cache[cache_key]
                    logger.debug(f"Entrada de cache expirada (age={elapsed:.1f}s)")
        
        # 1. Buscar en historial (sincrono, rapido)
        if use_history:
            history_results = functionsToHistory.search_in_qa_history(question)
            
            if history_results and history_results[0][0] > 0.6:
                score, best_match = history_results[0]
                
                logger.info(f"Respuesta encontrada en historial (score={score:.2f})")
                
                return {
                    'answer': best_match['answer'],
                    'personal_data': best_match.get('personal_data'),
                    'sources': best_match.get('sources', []),
                    'from_history': True,
                    'history_score': score,
                    'context_count': 0
                }
        
        # 2. Responder sin buscar documentos (no cachear estas respuestas)
        if not search_documents:
            return await self._generate_without_documents_async(question, conversation_history)
        
        # 3. Buscar en documentos y generar respuesta
        result = await self._generate_with_documents_async(
            question,
            conversation_history,
            search_kwargs
        )
        
        # 4. Guardar en cache si esta habilitado
        if self._cache_enabled and search_documents:
            cache_key = hash(question.lower().strip())
            
            # Implementar LRU: si el cache esta lleno, eliminar la entrada mas antigua
            if len(self._query_cache) >= self._cache_max_size:
                oldest_key = min(
                    self._query_cache.keys(),
                    key=lambda k: self._query_cache[k]['timestamp']
                )
                del self._query_cache[oldest_key]
                logger.debug(f"Cache lleno, eliminando entrada mas antigua")
            
            # Guardar en cache
            self._query_cache[cache_key] = {
                'result': result.copy(),
                'timestamp': datetime.now()
            }
            logger.debug(f"Resultado almacenado en cache (size={len(self._query_cache)})")
        
        return result
    
    def query(
        self,
        question: str,
        use_history: bool = True,
        search_documents: bool = True,
        search_kwargs: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Procesar consulta de forma sincrona (wrapper para compatibilidad)
        """
        return asyncio.run(
            self.query_async(
                question,
                use_history,
                search_documents,
                search_kwargs,
                conversation_history
            )
        )
    
    def change_model(self, new_model: str) -> bool:
        """
        Cambiar el modelo LLM dinamicamente
        
        Proceso:
        1. Mata proceso Ollama para liberar modelo anterior de memoria
        2. Guarda nuevo modelo en base de datos SQLite
        3. Invalida instancia LLM para forzar recarga
        
        Args:
            new_model: Nombre del nuevo modelo a utilizar (ej: 'gemma2:9b', 'llama3.2:3b')
        
        Returns:
            True si el cambio fue exitoso, False en caso contrario
        """
        try:
            from db_manager import set_model_setting
            from utils.process_utils import kill_ollama_process
            
            old_model = self.model_name
            logger.info(f"Iniciando cambio de modelo: {old_model} -> {new_model}")
            
            # 1. Matar proceso Ollama para liberar memoria del modelo anterior
            logger.info("Matando proceso Ollama para liberar modelo anterior...")
            if kill_ollama_process():
                logger.info("Proceso Ollama terminado exitosamente")
            else:
                logger.warning("No se pudo terminar proceso Ollama (podria no estar corriendo)")
            
            # 2. Guardar nuevo modelo en base de datos
            logger.info(f"Guardando modelo en base de datos: {new_model}")
            if not set_model_setting('last_used_model', new_model):
                logger.error("Error al guardar modelo en base de datos")
                return False
            
            # 3. Actualizar configuracion en memoria
            self.model_name = new_model
            
            # 4. Invalidar instancia LLM para forzar recarga en proxima consulta
            self._llm = None
            
            logger.info(f"Modelo cambiado exitosamente: {old_model} -> {new_model}")
            logger.info("El nuevo modelo se cargara automaticamente en la proxima consulta")
            return True
            
        except Exception as e:
            logger.error(f"Error al cambiar modelo: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _expand_query_async(self, question: str) -> str:
        """
        Expande la query original usando el LLM para mejorar la busqueda semantica.
        
        El LLM reformula la pregunta agregando:
        - Sinonimos y terminos relacionados
        - Expansion de acronimos
        - Contexto adicional relevante
        
        Args:
            question: Pregunta original del usuario
            
        Returns:
            Query expandida optimizada para busqueda semantica
        """
        expansion_prompt = f"""Eres un experto en reformular preguntas para busquedas semanticas.

Tu tarea: Reformular la siguiente pregunta para mejorar la busqueda en documentos personales.

Reglas:
1. Expande acronimos comunes (CURP, RFC, NSS, INE, etc.) a sus nombres completos
2. Agrega sinonimos y terminos relacionados
3. Agrega contexto sobre QUE tipo de documento contendria esa informacion
4. Manten el idioma original (español)
5. NO respondas la pregunta, solo reformulala para busqueda
6. Genera una version expandida de maximo 2-3 lineas
7. Enfocate en PALABRAS CLAVE que aparecerian en los documentos

Pregunta original: {question}

Query expandida (solo palabras clave y terminos de busqueda):"""

        try:
            expanded = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.llm.invoke(expansion_prompt)
            )
            
            # Limpiar la respuesta (remover saltos de linea excesivos, etc.)
            expanded = ' '.join(expanded.strip().split())
            
            # Si la expansion es muy corta o parece invalida, usar query original
            if len(expanded) < 10 or "no puedo" in expanded.lower():
                logger.warning(f"Expansion invalida, usando query original: {expanded}")
                return question
            
            return expanded
            
        except Exception as e:
            logger.error(f"Error expandiendo query: {e}")
            return question  # Fallback a query original
    
    def _should_use_query_expansion(self, question: str) -> bool:
        """
        Decide si usar Query Expansion basado en la pregunta.
        
        Query Expansion ayuda con:
        - Acronimos (CURP, RFC, NSS, INE, etc.)
        - Preguntas vagas o abstractas
        - Terminos tecnicos
        
        NO ayuda con:
        - Preguntas simples y directas
        - Nombres propios especificos
        - Busquedas de numeros exactos
        
        Returns:
            True si debe usar expansion, False si no
        """
        q_lower = question.lower()
        
        # Acronimos comunes en documentos personales mexicanos
        personal_data_keywords = [
            'curp', 'rfc', 'nss', 'seguro social',
            'registro federal', 'clave unica',
            'ine', 'credencial', 'identificacion',
            'nacimiento', 'acta', 'titulo',
            'cedula', 'profesional', 'certificado'
        ]
        
        # Si menciona datos personales, SI usar expansion
        if any(keyword in q_lower for keyword in personal_data_keywords):
            logger.info("Query sobre datos personales - Usando expansion")
            return True
        
        # Preguntas muy cortas (< 5 palabras) probablemente necesitan expansion
        if len(question.split()) < 5:
            logger.info("Query corta - Usando expansion")
            return True
        
        # Por defecto, NO usar expansion (velocidad)
        logger.info("Query directa - SIN expansion")
        return False
    
    async def _generate_without_documents_async(
        self,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Generar respuesta sin buscar documentos - flujo unificado con templates"""
        current_datetime = get_current_datetime_spanish()
        
        # Obtener toda la personalizacion del usuario
        personalization = get_user_personalization()
        
        # Usar template sin documentos para todos los modelos
        prompt_template = config.PROMPT_TEMPLATE_NO_DOCUMENTS
        
        # Reemplazar placeholders de personalizacion
        prompt_template = prompt_template.replace("{USER_NAME}", personalization['user_name'])
        prompt_template = prompt_template.replace("{USER_AGE}", str(personalization['user_age']))
        prompt_template = prompt_template.replace("{ASSISTANT_NAME}", personalization['assistant_name'])
        prompt_template = prompt_template.replace("{CUSTOM_INSTRUCTIONS}", personalization['custom_instructions'])
        prompt_template = prompt_template.replace("{USER_OCCUPATION}", personalization['user_occupation'])
        prompt_template = prompt_template.replace("{ABOUT_USER}", personalization['about_user'])
        prompt_template = prompt_template.replace("{CURRENT_DATETIME}", current_datetime)
        
        # Construir historial de conversacion
        conversation_history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_parts = ["Previous messages in this conversation:"]
            for msg in conversation_history[-30:]:
                role = "User" if msg["role"] == "user" else "Alfred"
                history_parts.append(f"{role}: {msg['content']}")
            conversation_history_text = "\n".join(history_parts)
        else:
            conversation_history_text = "No previous conversation history."
        
        # Reemplazar historial de conversacion
        prompt_template = prompt_template.replace("{conversation_history}", conversation_history_text)
        
        # Crear ChatPromptTemplate (mismo flujo que con documentos)
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        try:
            # Invocar LLM con template de LangChain (flujo unificado)
            answer = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.llm.invoke(
                    prompt.format(
                        input=question,
                        context=""  # Sin contexto de documentos
                    )
                )
            )
            
            return {
                'answer': answer,
                'personal_data': None,
                'sources': [],
                'from_history': False,
                'history_score': None,
                'context_count': 0
            }
        
        except Exception as e:
            logger.error(f"Error generando respuesta: {e}")
            return {
                'answer': f"Lo siento, hubo un error al procesar tu pregunta: {str(e)}",
                'personal_data': None,
                'sources': [],
                'from_history': False,
                'history_score': None,
                'context_count': 0
            }
    
    async def _generate_with_documents_async(
        self,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        search_kwargs: Optional[Dict[str, Any]] = None,
        use_query_expansion: bool = None  # None = auto-detectar
    ) -> Dict[str, Any]:
        """Generar respuesta con busqueda de documentos"""
        
        # 1. Query Expansion inteligente: solo cuando ayuda
        if use_query_expansion is None:
            use_query_expansion = self._should_use_query_expansion(question)
        
        if use_query_expansion:
            expanded_query = await self._expand_query_async(question)
            logger.info(f"Query original: {question}")
            logger.info(f"Query expandida: {expanded_query}")
        else:
            expanded_query = question
            logger.info(f"Query directa (sin expansion): {question}")
        
        # 2. Recuperar documentos relevantes con query expandida
        # Balance optimizado: velocidad + precision
        # k=12 permite encontrar CURP/RFC/NSS sin sobrecarga
        if search_kwargs is None:
            search_kwargs = {"k": 12, "fetch_k": 40}
        
        k = search_kwargs.get('k', 12)
        fetch_k = search_kwargs.get('fetch_k', 40)
        
        retrieval_result = await self.retriever.retrieve_async(
            query=expanded_query,  # Usar query expandida
            k=k,
            fetch_k=fetch_k
        )
        
        if not retrieval_result.documents:
            logger.warning("No se encontraron documentos relevantes")
            return await self._generate_without_documents_async(question, conversation_history)
        
        logger.info(f"Recuperados {len(retrieval_result.documents)} documentos relevantes")
        
        # 2. Preparar contexto para LLM (limitar a primeros docs mas relevantes)
        # Con k=12, tomamos todos pero limitamos el texto
        max_context_chars = 8000  # ~2000 tokens, suficiente para CURP/RFC/NSS
        
        context_string = self.retriever.get_context_string(
            retrieval_result.documents,
            include_metadata=True
        )
        
        # Truncar contexto si es demasiado largo (mantener inicio que es lo mas relevante)
        if len(context_string) > max_context_chars:
            context_string = context_string[:max_context_chars] + "\n\n[...contexto truncado por longitud...]"
            logger.info(f"Contexto truncado a {max_context_chars} caracteres")
        
        # 3. Construir historial de conversacion
        conversation_history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_parts = ["Previous messages in this conversation:"]
            for msg in conversation_history[-30:]:
                role = "User" if msg["role"] == "user" else "Alfred"
                history_parts.append(f"{role}: {msg['content']}")
            conversation_history_text = "\n".join(history_parts)
        else:
            conversation_history_text = "No previous conversation history."
        
        # Combinar historial de conversacion + contexto de documentos en un solo string
        combined_context = f"{conversation_history_text}\n\n--- DOCUMENT FRAGMENTS ---\n{context_string}"
        
        # 4. Generar prompt
        current_datetime = get_current_datetime_spanish()
        
        # Obtener toda la personalizacion del usuario
        personalization = get_user_personalization()
        
        # Usar template con documentos para todos los modelos
        prompt_template = config.PROMPT_TEMPLATE_WITH_DOCUMENTS
        
        # Reemplazar placeholders de personalizacion
        prompt_template = prompt_template.replace("{USER_NAME}", personalization['user_name'])
        prompt_template = prompt_template.replace("{USER_AGE}", str(personalization['user_age']))
        prompt_template = prompt_template.replace("{ASSISTANT_NAME}", personalization['assistant_name'])
        prompt_template = prompt_template.replace("{CUSTOM_INSTRUCTIONS}", personalization['custom_instructions'])
        prompt_template = prompt_template.replace("{USER_OCCUPATION}", personalization['user_occupation'])
        prompt_template = prompt_template.replace("{ABOUT_USER}", personalization['about_user'])
        prompt_template = prompt_template.replace("{CURRENT_DATETIME}", current_datetime)
        
        # 5. Crear prompt con ChatPromptTemplate (flujo unificado)
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        # 6. Generar respuesta usando el contexto combinado
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.llm.invoke(
                    prompt.format(
                        input=question,
                        context=combined_context  # Historial + documentos juntos
                    )
                )
            )
            
            # 6. Extraer datos personales
            all_personal_data = {}
            for doc in retrieval_result.documents:
                personal_data = self.extract_personal_data(doc.page_content)
                all_personal_data.update(personal_data)
            
            # 7. Obtener fuentes
            sources = list(set([
                doc.metadata.get('source', 'Desconocido')
                for doc in retrieval_result.documents
            ]))
            
            return {
                'answer': response,
                'personal_data': all_personal_data if all_personal_data else None,
                'sources': sources,
                'from_history': False,
                'history_score': None,
                'context_count': len(retrieval_result.documents)
            }
        
        except Exception as e:
            logger.error(f"Error generando respuesta con documentos: {e}")
            raise
    
    @staticmethod
    def extract_personal_data(text: str) -> Dict[str, str]:
        """Extraer RFC, CURP y otros datos personales del texto"""
        import re
        
        patterns = {
            'RFC': r'RFC[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})',
            'CURP': r'CURP[:\s]*([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)',
            'NSS': r'NSS[:\s]*(\d{11})',
        }
        
        found_data = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                found_data[key] = match.group(1)
        
        return found_data
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtener estadisticas del sistema"""
        from db_manager import get_qa_history_stats, get_document_stats, get_user_setting
        
        qa_stats = get_qa_history_stats()
        doc_stats = self.vector_manager.get_stats() if self._vector_manager else {}
        
        # Obtener nombre actualizado desde BD
        current_user_name = get_user_setting('user_name', default='Usuario')
        
        # Obtener rutas configuradas desde BD
        from db_manager import get_document_paths
        configured_paths = get_document_paths(enabled_only=False)
        enabled_paths = get_document_paths(enabled_only=True)
        
        return {
            'user_name': current_user_name,
            'model_name': self.model_name,
            'embedding_model': self.embedding_model,
            'configured_paths': len(configured_paths),
            'enabled_paths': len(enabled_paths),
            'chroma_db_path': self.chroma_db_path,
            'status': 'initialized' if self._initialized else 'not_initialized',
            'gpu_info': self.gpu_manager.gpu_info if self._gpu_manager else {},
            'using_gpu': self.gpu_manager.has_gpu if self._gpu_manager else False,
            'qa_history_total': qa_stats.get('total', 0),
            'documents_indexed': doc_stats.get('indexed_documents', 0),
            'total_chunks': doc_stats.get('total_chunks', 0),
            'vector_count': doc_stats.get('vector_count', 0)
        }
    
    def is_initialized(self) -> bool:
        """Verificar si esta inicializado"""
        return self._initialized
    
    def get_current_model(self) -> str:
        """Obtener nombre del modelo actual"""
        return self.model_name
    
    def get_gpu_status(self) -> str:
        """Obtener reporte del estado de GPU"""
        return self.gpu_manager.get_status_report()
    
    def clear_gpu_cache(self):
        """Limpiar cache de GPU si esta disponible"""
        self.gpu_manager.clear_cache()
    
    def get_gpu_memory_usage(self) -> Optional[Dict]:
        """Obtener uso de memoria de GPU"""
        return self.gpu_manager.get_memory_usage()
    
    def get_ollama_keep_alive(self) -> int:
        """
        Obtener el valor actual de keep_alive para Ollama
        
        Returns:
            Tiempo en segundos que Ollama mantiene el modelo en memoria
        """
        return self.ollama_keep_alive
    
    def set_ollama_keep_alive(self, seconds: int) -> bool:
        """
        Configurar el tiempo de keep_alive para Ollama
        
        Args:
            seconds: Tiempo en segundos (minimo 1, maximo 3600)
        
        Returns:
            True si el cambio fue exitoso, False en caso contrario
        """
        try:
            if seconds < 1 or seconds > 3600:
                logger.error(f"Valor de keep_alive invalido: {seconds}. Debe estar entre 1 y 3600 segundos")
                return False
            
            logger.info(f"Cambiando keep_alive de {self.ollama_keep_alive}s a {seconds}s")
            
            # Actualizar valor en memoria
            self.ollama_keep_alive = seconds
            
            # Guardar en base de datos
            from db_manager import set_user_setting
            set_user_setting('ollama_keep_alive', seconds, 'int')
            logger.info(f"Keep_alive guardado en BD: {seconds}s")
            
            # Recrear LLM con nuevo keep_alive
            from langchain_ollama import OllamaLLM
            
            self.llm = OllamaLLM(
                model=self.model_name,
                base_url="http://localhost:11434",
                keep_alive=seconds
            )
            
            logger.info(f"Keep_alive actualizado exitosamente a {seconds}s")
            return True
            
        except Exception as e:
            logger.error(f"Error al cambiar keep_alive: {e}")
            return False
    
    async def reindex_documents_async(self):
        """
        DEPRECADO: Reindexacion ahora se maneja via endpoint POST /documents/reindex
        Este metodo se mantiene por compatibilidad pero no debe usarse.
        """
        logger.warning("reindex_documents_async() esta deprecado. Usar endpoint POST /documents/reindex")
        raise NotImplementedError(
            "La reindexacion ahora se maneja exclusivamente via API REST. "
            "Usar: POST /documents/reindex con las rutas configuradas desde la UI."
        )
    
    def clear_query_cache(self):
        """Limpiar todo el cache de queries"""
        if self._cache_enabled:
            cache_size = len(self._query_cache)
            self._query_cache.clear()
            logger.info(f"Cache de queries limpiado ({cache_size} entradas eliminadas)")
            return cache_size
        return 0
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Obtener estadisticas del cache de queries
        
        Returns:
            Dict con metricas del cache:
            - enabled: Si el cache esta habilitado
            - size: Numero de entradas actuales
            - max_size: Tamaño maximo del cache
            - ttl_seconds: TTL en segundos
            - entries: Lista de entradas con edad
        """
        if not self._cache_enabled:
            return {
                'enabled': False,
                'size': 0,
                'max_size': self._cache_max_size,
                'ttl_seconds': self._cache_ttl_seconds
            }
        
        now = datetime.now()
        entries = []
        
        for cache_key, cached_entry in self._query_cache.items():
            age_seconds = (now - cached_entry['timestamp']).total_seconds()
            entries.append({
                'cache_key': cache_key,
                'age_seconds': age_seconds,
                'expired': age_seconds >= self._cache_ttl_seconds
            })
        
        return {
            'enabled': True,
            'size': len(self._query_cache),
            'max_size': self._cache_max_size,
            'ttl_seconds': self._cache_ttl_seconds,
            'entries': entries
        }
    
    def reload_documents(self):
        """
        Recargar documentos (wrapper sincrono para compatibilidad)
        Ejecuta reindex_documents_async en el event loop actual
        """
        logger.info("Iniciando recarga de documentos...")
        
        try:
            # Intentar obtener event loop existente
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Si el loop ya esta corriendo, crear una tarea
                return asyncio.create_task(self.reindex_documents_async())
            else:
                # Si no hay loop corriendo, ejecutar directamente
                return loop.run_until_complete(self.reindex_documents_async())
        except RuntimeError:
            # No hay event loop, crear uno nuevo
            return asyncio.run(self.reindex_documents_async())
    
    def test_search(self, query: str, k: int = 5):
        """
        Realizar una busqueda directa en la base de datos (para testing)
        
        Args:
            query: Consulta de busqueda
            k: Numero de resultados a devolver
        
        Returns:
            Lista de documentos encontrados
        """
        if not self._initialized:
            raise RuntimeError("Alfred Core no esta inicializado")
        
        vectorstore = self.vector_manager.get_vectorstore()
        if not vectorstore:
            raise RuntimeError("Vectorstore no esta disponible")
        
        return vectorstore.similarity_search(query, k=k)
    
    def close(self):
        """Cerrar recursos"""
        if self._vector_manager:
            self._vector_manager.close()
        
        if self._gpu_manager:
            self._gpu_manager.clear_cache()
        
        logger.info("Alfred Core cerrado")
