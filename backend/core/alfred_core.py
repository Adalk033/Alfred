"""
Alfred Core - Lógica de negocio del asistente
Maneja la carga de documentos, búsquedas y generación de respuestas
"""

import os
import re
from pathlib import Path
from typing import Dict, Optional, Any, List
from dotenv import load_dotenv
from datetime import datetime
import locale

from langchain_ollama import OllamaLLM
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.vectorstores.utils import filter_complex_metadata
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

import config
import functionsToHistory
from gpu_manager import get_gpu_manager


def get_current_datetime_spanish() -> str:
    """
    Obtener la fecha y hora actual formateada en español
    
    Returns:
        String con fecha y hora en formato legible en español
        Ejemplo: "Lunes, 7 de Octubre de 2025, 14:30:45 (hora local de Mexico)"
    """
    # Nombres de dias y meses en español
    dias = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
    meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
             'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    
    now = datetime.now()
    
    # Formato: "Lunes, 7 de Octubre de 2025, 14:30:45"
    dia_semana = dias[now.weekday()]
    dia = now.day
    mes = meses[now.month - 1]
    año = now.year
    hora = now.strftime("%H:%M:%S")
    
    fecha_formateada = f"{dia_semana}, {dia} de {mes} de {año}, {hora}"
    
    return fecha_formateada


class AlfredCore:
    """Núcleo del asistente Alfred con toda la lógica de negocio"""
    
    def __init__(self):
        """Inicializar Alfred Core"""
        load_dotenv()
        
        # Inicializar gestor de GPU primero
        self.gpu_manager = get_gpu_manager()
        
        # Configuración desde variables de entorno
        self.docs_path = os.getenv('ALFRED_DOCS_PATH')
        self.chroma_db_path = os.getenv('ALFRED_CHROMA_PATH', './chroma_db')
        self.force_reload = os.getenv('ALFRED_FORCE_RELOAD', 'false').lower() == 'true'
        self.qa_history_file = os.getenv('ALFRED_HISTORY_FILE', './alfred_qa_history.json')
        self.user_name = os.getenv('ALFRED_USER_NAME', 'Usuario')
        self.model_name = os.getenv('ALFRED_MODEL', 'gemma2:9b')
        self.embedding_model = os.getenv('ALFRED_EMBEDDING_MODEL', 'nomic-embed-text:v1.5')
        
        # Configuracion de keep_alive para Ollama (en segundos)
        # Valor por defecto: 30 segundos
        # Despues de este tiempo sin uso, Ollama descargara el modelo de memoria
        self.ollama_keep_alive = int(os.getenv('ALFRED_OLLAMA_KEEP_ALIVE', '30'))
        
        # Validar configuración
        if not self.docs_path:
            raise ValueError("Error: Define la variable de entorno ALFRED_DOCS_PATH")
        
        # Estado interno
        self.vectorstore = None
        self.llm = None
        self.retrieval_chain = None
        self._initialized = False
        
        # Inicializar componentes
        self._initialize()
    
    def _initialize(self):
        """Inicializar todos los componentes de Alfred"""
        import sys
        print(f"\nInicializando Alfred Core...", flush=True)
        print(f"   Usuario: {self.user_name}", flush=True)
        print(f"   Modelo LLM: {self.model_name}", flush=True)
        print(f"   Modelo Embeddings: {self.embedding_model}", flush=True)
        print(f"   Ruta documentos: {self.docs_path}", flush=True)
        sys.stdout.flush()
        
        # Configurar GPU para Ollama
        print("\n" + "="*60, flush=True)
        print("DETECTANDO Y CONFIGURANDO GPU...", flush=True)
        print("="*60, flush=True)
        sys.stdout.flush()
        
        self.gpu_manager.configure_ollama_for_gpu()
        self.gpu_manager.optimize_for_inference()
        
        # Mostrar estado de GPU de forma visual
        if self.gpu_manager.has_gpu:
            print("\n" + "="*60, flush=True)
            print("   GPU DETECTADA Y ACTIVA", flush=True)
            print("   " + "="*58, flush=True)
            print(f"   Tipo: {self.gpu_manager.device_type}", flush=True)
            sys.stdout.flush()
            gpu_info = self.gpu_manager.gpu_info
            if 'device_name' in gpu_info:
                print(f"   Nombre: {gpu_info['device_name']}", flush=True)
            if 'memory_total' in gpu_info:
                print(f"   Memoria: {gpu_info['memory_total']:.2f} GB", flush=True)
            if 'cuda_version' in gpu_info:
                print(f"   CUDA Version: {gpu_info['cuda_version']}", flush=True)
            print("   Estado: Ollama configurado para usar GPU", flush=True)
            print("   " + "="*58, flush=True)
        else:
            print("\n" + "="*58, flush=True)
            print("MODO CPU ACTIVO", flush=True)
            print("="*58, flush=True)
            print("No se detectó GPU dedicada", flush=True)
            print("Usando CPU para procesamiento", flush=True)
            print("Para mejor rendimiento, considera usar una GPU", flush=True)
            print("="*58, flush=True)
        print("\n", flush=True)
        sys.stdout.flush()
        
        # Inicializar LLM con keep_alive configurable
        # keep_alive controla cuanto tiempo Ollama mantiene el modelo en memoria
        # Formato: numero de segundos (ej: 30) o "0" para descargar inmediatamente
        self.llm = OllamaLLM(
            model=self.model_name,
            keep_alive=self.ollama_keep_alive
        )
        print(f"LLM inicializado (keep_alive: {self.ollama_keep_alive}s)", flush=True)
        sys.stdout.flush()
        
        # Inicializar embeddings
        embeddings = OllamaEmbeddings(model=self.embedding_model)
        print(f"Embeddings inicializados", flush=True)
        sys.stdout.flush()
        
        # Cargar o crear vectorstore
        if os.path.exists(self.chroma_db_path) and not self.force_reload:
            print("Cargando base de datos existente...", flush=True)
            self.vectorstore = Chroma(
                persist_directory=self.chroma_db_path,
                embedding_function=embeddings
            )
            
            # Verificar contenido
            try:
                collection = self.vectorstore._collection
                count = collection.count()
                print(f"Base de datos cargada: {count} documentos", flush=True)
                sys.stdout.flush()
                
                if count == 0:
                    print("La base de datos está vacía. Recargando documentos...", flush=True)
                    self.vectorstore = self._load_and_process_documents(embeddings)
            except Exception as e:
                print(f"Error al verificar BD: {e}", flush=True)
                self.vectorstore = self._load_and_process_documents(embeddings)
        else:
            if self.force_reload:
                print("Forzando recarga de documentos...", flush=True)
            else:
                print("Primera ejecución. Procesando documentos...", flush=True)
            sys.stdout.flush()
            
            self.vectorstore = self._load_and_process_documents(embeddings)
        
        # Crear la cadena de recuperación
        print("Configurando cadena de recuperacion...", flush=True)
        self._setup_retrieval_chain()
        
        self._initialized = True
        print("\n" + "="*60, flush=True)
        print("Alfred Core completamente inicializado y listo", flush=True)
        print("="*60 + "\n", flush=True)
        sys.stdout.flush()
    
    def _load_and_process_documents(self, embeddings):
        """Cargar y procesar documentos desde el directorio configurado"""
        import sys
        print("\nCargando documentos personales...", flush=True)
        sys.stdout.flush()
        
        # Cargar documentos con loaders específicos por tipo de archivo
        docs = []
        not_readable_file = ".notReadable"
        failed_files = []
        
        print("Escaneando archivos...", flush=True)
        all_files = list(Path(self.docs_path).rglob("*"))
        total_files = len([f for f in all_files if f.is_file()])
        print(f"Encontrados {total_files} archivos", flush=True)
        sys.stdout.flush()
        
        processed = 0
        for file_path in all_files:
            if not file_path.is_file():
                continue
            
            try:
                # Determinar loader según extensión
                suffix = file_path.suffix.lower()
                
                if suffix == '.pdf':
                    # Usar PyPDFLoader para PDFs
                    loader = PyPDFLoader(str(file_path))
                    docs.extend(loader.load())
                elif suffix in ['.txt', '.md', '.csv', '.json', '.xml', '.html']:
                    # Usar TextLoader para archivos de texto
                    loader = TextLoader(str(file_path), encoding='utf-8')
                    docs.extend(loader.load())
                else:
                    # Intentar cargar como texto para otros tipos
                    try:
                        loader = TextLoader(str(file_path), encoding='utf-8')
                        docs.extend(loader.load())
                    except Exception:
                        # Si falla, intentar con encoding latin-1
                        try:
                            loader = TextLoader(str(file_path), encoding='latin-1')
                            docs.extend(loader.load())
                        except Exception:
                            failed_files.append(str(file_path))
                            continue
                
                processed += 1
                if processed % 10 == 0:
                    print(f"Procesados {processed}/{total_files} archivos...", flush=True)
                    sys.stdout.flush()
                    
            except Exception as e:
                print(f"Error al cargar {file_path.name}: {str(e)}", flush=True)
                failed_files.append(str(file_path))
                continue
        
        if failed_files:
            print(f"\n{len(failed_files)} archivos no se pudieron procesar", flush=True)
            with open(not_readable_file, 'w', encoding='utf-8') as f:
                for failed_file in failed_files:
                    f.write(f"{failed_file}\n")
            print(f"Lista guardada en {not_readable_file}", flush=True)
        
        print(f"\n{len(docs)} documentos cargados exitosamente", flush=True)
        sys.stdout.flush()
        
        # Dividir en chunks
        print("Dividiendo documentos en chunks...", flush=True)
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=3000,
            chunk_overlap=600,
            add_start_index=True,
            separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""],
            keep_separator=True
        )
        splits = text_splitter.split_documents(docs)
        print(f"{len(splits)} chunks creados", flush=True)
        sys.stdout.flush()
        
        # Filtrar metadata compleja
        print("Limpiando metadata...", flush=True)
        splits = filter_complex_metadata(splits)
        
        # Crear vectorstore
        print("Creando embeddings y almacenando en base de datos vectorial...", flush=True)
        print("   Esto puede tomar varios minutos...", flush=True)
        sys.stdout.flush()
        vectorstore = Chroma.from_documents(
            documents=splits,
            embedding=embeddings,
            persist_directory=self.chroma_db_path
        )
        print("Base de datos vectorial creada exitosamente", flush=True)
        sys.stdout.flush()
        
        return vectorstore
    
    def _setup_retrieval_chain(self):
        """Configurar la cadena de recuperación"""
        # Preparar prompt con fecha/hora actual
        current_datetime = get_current_datetime_spanish()
        
        if self.model_name in ["gpt-oss:20b"]:
            prompt_template = config.PROMPT_TEMPLATE_GPT_ONLY.replace("{USER_NAME}", self.user_name)
        else:
            prompt_template = config.PROMPT_TEMPLATE.replace("{USER_NAME}", self.user_name)
        
        # Inyectar fecha y hora actual en el prompt
        prompt_template = prompt_template.replace("{CURRENT_DATETIME}", current_datetime)
        
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        # Configurar retriever
        retriever = self.vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": 20,
                "fetch_k": 100
            }
        )
        
        # Crear cadena
        document_chain = create_stuff_documents_chain(self.llm, prompt)
        self.retrieval_chain = create_retrieval_chain(retriever, document_chain)
    
    @staticmethod
    def extract_personal_data(text: str) -> Dict[str, str]:
        """Extraer RFC, CURP y otros datos personales del texto"""
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
    
    def query(
        self,
        question: str,
        use_history: bool = True,
        search_documents: bool = True,
        search_kwargs: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Procesar una consulta del usuario
        
        Args:
            question: Pregunta del usuario
            use_history: Buscar primero en el historial
            search_documents: Buscar en documentos o solo usar el prompt
            search_kwargs: Parámetros adicionales de búsqueda
            conversation_history: Historial de conversacion para contexto
        
        Returns:
            Diccionario con la respuesta y metadata
        """
        if not self._initialized:
            raise RuntimeError("Alfred Core no está inicializado")
        
        # 1. Buscar en historial si está habilitado
        if use_history:
            history_results = functionsToHistory.search_in_qa_history(question)
            
            if history_results and history_results[0][0] > 0.6:
                score, best_match = history_results[0]
                
                return {
                    'answer': best_match['answer'],
                    'personal_data': best_match.get('personal_data'),
                    'sources': best_match.get('sources', []),
                    'from_history': True,
                    'history_score': score,
                    'context_count': 0
                }
        
        # 2. Si search_documents es False, responder solo con el LLM sin buscar en documentos
        if not search_documents:
            # Obtener fecha/hora actual
            current_datetime = get_current_datetime_spanish()
            
            # Usar el template para modo sin documentos
            prompt_template = config.PROMPT_TEMPLATE_NO_DOCUMENTS.replace("{USER_NAME}", self.user_name)
            
            # Inyectar fecha y hora actual
            prompt_template = prompt_template.replace("{CURRENT_DATETIME}", current_datetime)
            
            # Construir contexto con historial de conversacion si existe
            context_parts = []
            if conversation_history and len(conversation_history) > 0:
                context_parts.append("Previous messages in this conversation:")
                for msg in conversation_history[-30:]:  # Ultimos 30 mensajes
                    role = "User" if msg["role"] == "user" else "Alfred"
                    context_parts.append(f"{role}: {msg['content']}")
            
            # Si no hay historial, indicar que no hay contexto adicional
            if not context_parts:
                context_parts.append("No previous conversation history.")
            
            context_text = "\n".join(context_parts)
            
            # Reemplazar placeholders del template
            final_prompt = prompt_template.replace("{context}", context_text)
            final_prompt = final_prompt.replace("{input}", question)
            
            try:
                answer = self.llm.invoke(final_prompt)
                
                return {
                    'answer': answer,
                    'personal_data': None,
                    'sources': [],
                    'from_history': False,
                    'history_score': None,
                    'context_count': 0
                }
            except Exception as e:
                return {
                    'answer': f"Lo siento, hubo un error al procesar tu pregunta: {str(e)}",
                    'personal_data': None,
                    'sources': [],
                    'from_history': False,
                    'history_score': None,
                    'context_count': 0
                }
        
        # 3. Buscar en documentos usando la cadena de recuperación
        # IMPORTANTE: Reconfigurar la cadena con la fecha/hora actual antes de cada consulta
        current_datetime = get_current_datetime_spanish()
        
        # Preparar prompt con fecha/hora actualizada usando el template para documentos
        if self.model_name in ["gpt-oss:20b"]:
            prompt_template = config.PROMPT_TEMPLATE_GPT_ONLY.replace("{USER_NAME}", self.user_name)
        else:
            prompt_template = config.PROMPT_TEMPLATE_WITH_DOCUMENTS.replace("{USER_NAME}", self.user_name)
        
        # Inyectar fecha y hora actual
        prompt_template = prompt_template.replace("{CURRENT_DATETIME}", current_datetime)
        
        # Construir historial de conversacion para el template
        conversation_history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_parts = ["Previous messages in this conversation:"]
            for msg in conversation_history[-30:]:  # Ultimos 30 mensajes para contexto
                role = "User" if msg["role"] == "user" else "Alfred"
                history_parts.append(f"{role}: {msg['content']}")
            conversation_history_text = "\n".join(history_parts)
        else:
            conversation_history_text = "No previous conversation history."
        
        # Inyectar historial de conversacion en el template
        prompt_template = prompt_template.replace("{conversation_history}", conversation_history_text)
        
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        # Recrear la cadena con el prompt actualizado
        document_chain = create_stuff_documents_chain(self.llm, prompt)
        retrieval_chain = create_retrieval_chain(
            self.vectorstore.as_retriever(
                search_type="mmr",
                search_kwargs=search_kwargs or {"k": 20, "fetch_k": 100}
            ),
            document_chain
        )
        
        # La pregunta se pasa directamente, el historial ya esta en el template
        query_input = question
        
        # Usar la cadena actualizada en lugar de self.retrieval_chain
        response = retrieval_chain.invoke({"input": query_input})
        
        # 4. Extraer datos personales de todos los fragmentos
        all_personal_data = {}
        for doc in response.get('context', []):
            personal_data = self.extract_personal_data(doc.page_content)
            all_personal_data.update(personal_data)
        
        # 5. Obtener fuentes
        sources = list(set([
            doc.metadata.get('source', 'Desconocido')
            for doc in response.get('context', [])
        ]))
        
        # 6. Determinar respuesta final
        user_input_lower = question.lower()
        if ('rfc' in user_input_lower or 'curp' in user_input_lower or 'nss' in user_input_lower) and all_personal_data:
            answer_parts = ["Encontré la siguiente información en tus documentos:"]
            for key, value in all_personal_data.items():
                if key.lower() in user_input_lower:
                    answer_parts.append(f"Tu {key} es: {value}")
            final_answer = "\n".join(answer_parts)
        else:
            final_answer = response['answer']
        
        return {
            'answer': final_answer,
            'personal_data': all_personal_data if all_personal_data else None,
            'sources': sources,
            'from_history': False,
            'history_score': None,
            'context_count': len(response.get('context', []))
        }
    
    def test_search(self, query: str, k: int = 5):
        """Realizar una búsqueda directa en la base de datos (para testing)"""
        if not self._initialized:
            raise RuntimeError("Alfred Core no está inicializado")
        
        return self.vectorstore.similarity_search(query, k=k)
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtener estadísticas de la base de datos"""
        if not self._initialized:
            raise RuntimeError("Alfred Core no está inicializado")
        
        try:
            collection = self.vectorstore._collection
            doc_count = collection.count()
        except Exception:
            doc_count = 0
        
        history = functionsToHistory.load_qa_history(self.qa_history_file)
        
        return {
            'total_documents': doc_count,
            'total_qa_history': len(history),
            'chroma_db_path': self.chroma_db_path,
            'docs_path': self.docs_path,
            'user_name': self.user_name,
            'model_name': self.model_name,
            'status': 'initialized' if self._initialized else 'not_initialized',
            'gpu_info': self.gpu_manager.gpu_info,
            'using_gpu': self.gpu_manager.has_gpu,
            'device': self.gpu_manager.device
        }
    
    def reload_documents(self):
        """Recargar documentos desde el directorio"""
        print("Recargando documentos...")
        
        embeddings = OllamaEmbeddings(model=self.embedding_model)
        self.vectorstore = self._load_and_process_documents(embeddings)
        self._setup_retrieval_chain()
        
        print("Documentos recargados exitosamente")
    
    def is_initialized(self) -> bool:
        """Verificar si el núcleo está inicializado"""
        return self._initialized
    
    def get_current_model(self) -> str:
        """Obtener el nombre del modelo actual"""
        return self.model_name
    
    def change_model(self, new_model: str) -> bool:
        """
        Cambiar el modelo LLM dinámicamente
        
        Args:
            new_model: Nombre del nuevo modelo a utilizar
        
        Returns:
            True si el cambio fue exitoso, False en caso contrario
        """
        try:
            print(f"Cambiando modelo de {self.model_name} a {new_model}...")
            
            # Crear nueva instancia del LLM con el nuevo modelo y keep_alive configurado
            new_llm = OllamaLLM(
                model=new_model,
                keep_alive=self.ollama_keep_alive
            )
            
            # Actualizar el modelo
            self.llm = new_llm
            self.model_name = new_model
            
            # Reconfigurar la cadena de recuperación con el nuevo LLM
            self._setup_retrieval_chain()
            
            print(f"Modelo cambiado exitosamente a {new_model}")
            return True
            
        except Exception as e:
            print(f"Error al cambiar modelo: {e}")
            return False
    
    def get_gpu_status(self) -> str:
        """Obtener reporte del estado de GPU"""
        return self.gpu_manager.get_status_report()
    
    def clear_gpu_cache(self):
        """Limpiar caché de GPU si está disponible"""
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
        Actualizar el valor de keep_alive para Ollama
        
        Args:
            seconds: Tiempo en segundos (minimo 0, maximo 3600)
        
        Returns:
            True si se actualizo exitosamente, False en caso contrario
        """
        try:
            # Validar rango
            if seconds < 0 or seconds > 3600:
                print(f"Valor de keep_alive fuera de rango: {seconds}")
                return False
            
            print(f"Actualizando keep_alive de {self.ollama_keep_alive}s a {seconds}s...")
            
            # Actualizar configuracion
            self.ollama_keep_alive = seconds
            
            # Guardar en variable de entorno para persistencia
            os.environ['ALFRED_OLLAMA_KEEP_ALIVE'] = str(seconds)
            
            # Reinicializar LLM con el nuevo keep_alive
            self.llm = OllamaLLM(
                model=self.model_name,
                keep_alive=self.ollama_keep_alive
            )
            
            # Reconfigurar la cadena de recuperacion
            self._setup_retrieval_chain()
            
            print(f"keep_alive actualizado exitosamente a {seconds}s")
            return True
            
        except Exception as e:
            print(f"Error al actualizar keep_alive: {e}")
            return False


