"""
Alfred Backend API - FastAPI Server
"""

import sys
import io
import os
from pathlib import Path

# Agregar directorios al path de Python para imports
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
sys.path.insert(0, str(backend_root / "core"))
sys.path.insert(0, str(backend_root / "gpu"))
sys.path.insert(0, str(backend_root / "utils"))

from utils.logger import get_logger

# ============================================
# AUTO-REPARACION DE DEPENDENCIAS
# ============================================
try:
    from utils.auto_repair import run_auto_repair, get_repair_status
    
    logger_temp = get_logger("auto_repair")
    logger_temp.info("[STARTUP] Verificando integridad del sistema...")
    
    # Verificar estado antes de continuar
    repair_status = get_repair_status()
    
    if repair_status['overall'] == 'needs_repair':
        logger_temp.warning("[STARTUP] Detectados problemas - Aplicando correcciones automaticas...")
        
        # Ejecutar reparacion
        success = run_auto_repair()
        
        if not success:
            logger_temp.warning("[STARTUP] Correcciones aplicadas - Reiniciando automaticamente...")
            # NO imprimir mensaje visible al usuario en produccion
            # Electron detectara el exit code 3 y reiniciara automaticamente
            sys.exit(3)  # Codigo 3 = auto-reparacion completada, reinicio automatico
    else:
        logger_temp.info("[STARTUP] Sistema OK - Continuando inicio...")
        
except Exception as e:
    # Si falla la auto-reparacion, continuar con advertencia
    print(f"[STARTUP WARNING] No se pudo ejecutar auto-reparacion: {e}")

# ============================================
# CONTINUACION DEL INICIO NORMAL
# ============================================

from db_manager import init_db
import db_manager

# Configurar encoding UTF-8 para evitar errores con caracteres especiales en Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager
import asyncio
import json

# Importar módulos locales
import functionsToHistory
from alfred_core import AlfredCore
from conversation_manager import get_conversation_manager
from utils.security import encrypt_data, decrypt_data, encrypt_for_transport, is_encryption_enabled
from functionsToHistory import encrypt_personal_data, decrypt_personal_data

# Importar routers de endpoints
from endpoints.user.user import router as user_router
from endpoints.conversations.conversations import router as conversations_router
from endpoints.documents.documents import router as documents_router
from endpoints.security.security import router as security_router
from endpoints.application.ollama import router as ollama_router
from endpoints.application.gpu import router as gpu_router, GPUStatus
from endpoints.application.optimizations import router as optimizations_router
from endpoints.settings.setting import router as settings_router
from endpoints.query.query import router as query_router
from endpoints.history.history import router as history_router
from endpoints.maintenance.maintenance import router as maintenance_router
from endpoints.shared_state import set_alfred_core_instance
# Importar modelos de usuario si se necesitan en otros endpoints
# from endpoints.user.user import UserSettingRequest, UserSettingResponse, ProfilePictureRequest, ProfilePictureHistoryResponse

# --- Utilidades para procesamiento de archivos ---

def extract_text_from_pdf(content: str, file_name: str) -> str:
    """
    Extraer texto de un PDF a partir de su contenido en base64 o texto
    
    Args:
        content: Contenido del PDF (puede ser base64 con o sin prefijo data:)
        file_name: Nombre del archivo para logging
        
    Returns:
        Texto extraído del PDF
    """
    try:
        import pypdf
        import base64
        from io import BytesIO
        import re
        
        print(f"🔍 Procesando PDF: {file_name}")
        print(f"📏 Longitud del contenido recibido: {len(content)} caracteres")
        
        # Limpiar prefijo data: si existe (ej: data:application/pdf;base64,)
        if content.startswith('data:'):
            print(f"🧹 Limpiando prefijo data: URL...")
            # Buscar la coma que separa el header del contenido base64
            match = re.search(r'base64,(.+)', content)
            if match:
                content = match.group(1)
                print(f"✅ Prefijo removido, nueva longitud: {len(content)} caracteres")
            else:
                print(f"⚠️ No se encontro separador base64, usando contenido completo")
        
        # Decodificar base64
        try:
            print(f"🔓 Decodificando base64...")
            pdf_bytes = base64.b64decode(content)
            print(f"✅ Decodificado exitoso: {len(pdf_bytes)} bytes")
        except Exception as decode_error:
            print(f"❌ Error al decodificar base64: {str(decode_error)}")
            raise ValueError(f"Error al decodificar base64: {str(decode_error)}")
        
        # Crear objeto PDF
        print(f"📄 Creando lector PDF...")
        pdf_file = BytesIO(pdf_bytes)
        pdf_reader = pypdf.PdfReader(pdf_file)
        
        print(f"📚 PDF cargado: {len(pdf_reader.pages)} paginas")
        
        # Extraer texto de todas las páginas
        text_parts = []
        for page_num, page in enumerate(pdf_reader.pages):
            try:
                text = page.extract_text()
                if text.strip():
                    text_parts.append(f"--- Pagina {page_num + 1} ---\n{text}")
                    print(f"  ✅ Pagina {page_num + 1}: {len(text)} caracteres")
                else:
                    print(f"  ⚠️ Pagina {page_num + 1}: vacia o sin texto extraible")
            except Exception as page_error:
                print(f"  ❌ Error en pagina {page_num + 1}: {str(page_error)}")
                text_parts.append(f"--- Pagina {page_num + 1} ---\n[Error al extraer texto de esta pagina]")
        
        extracted_text = "\n\n".join(text_parts)
        print(f"✅ PDF procesado exitosamente: {file_name}")
        print(f"📊 Total: {len(pdf_reader.pages)} paginas, {len(extracted_text)} caracteres extraidos")
        
        return extracted_text if extracted_text else "[PDF procesado pero no se pudo extraer texto]"
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"❌ Error al procesar PDF {file_name}:")
        print(error_detail)
        return f"[Error al procesar PDF: {str(e)}. Por favor verifica que el archivo no este corrupto.]"


def extract_text_from_docx(content: str, file_name: str) -> str:
    """
    Extraer texto de un documento Word (.docx) a partir de su contenido en base64
    
    Args:
        content: Contenido del archivo en base64 (con o sin prefijo data:)
        file_name: Nombre del archivo para logging
        
    Returns:
        Texto extraído del documento
    """
    try:
        from docx import Document
        import base64
        from io import BytesIO
        import re
        
        print(f"🔍 Procesando Word: {file_name}")
        
        # Limpiar prefijo data: si existe
        if content.startswith('data:'):
            match = re.search(r'base64,(.+)', content)
            if match:
                content = match.group(1)
        
        # Decodificar contenido base64
        docx_bytes = base64.b64decode(content)
        docx_file = BytesIO(docx_bytes)
        
        # Cargar documento
        doc = Document(docx_file)
        
        # Extraer texto de parrafos
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        
        # Extraer texto de tablas
        for table in doc.tables:
            table_text = []
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    table_text.append(row_text)
            if table_text:
                text_parts.append("\n--- Tabla ---\n" + "\n".join(table_text))
        
        extracted_text = "\n\n".join(text_parts)
        print(f"✅ Word procesado: {file_name} - {len(doc.paragraphs)} parrafos, {len(extracted_text)} caracteres")
        
        return extracted_text if extracted_text else "[Documento Word procesado pero no se pudo extraer texto]"
        
    except Exception as e:
        import traceback
        print(f"❌ Error al procesar Word {file_name}:")
        print(traceback.format_exc())
        return f"[Error al procesar documento Word: {str(e)}]"


def extract_text_from_xlsx(content: str, file_name: str) -> str:
    """
    Extraer texto de una hoja de calculo Excel (.xlsx) a partir de su contenido en base64
    
    Args:
        content: Contenido del archivo en base64 (con o sin prefijo data:)
        file_name: Nombre del archivo para logging
        
    Returns:
        Texto extraído de todas las hojas
    """
    try:
        from openpyxl import load_workbook
        import base64
        from io import BytesIO
        import re
        
        print(f"🔍 Procesando Excel: {file_name}")
        
        # Limpiar prefijo data: si existe
        if content.startswith('data:'):
            match = re.search(r'base64,(.+)', content)
            if match:
                content = match.group(1)
        
        # Decodificar contenido base64
        xlsx_bytes = base64.b64decode(content)
        xlsx_file = BytesIO(xlsx_bytes)
        
        # Cargar workbook
        wb = load_workbook(xlsx_file, data_only=True)
        
        # Extraer texto de cada hoja
        sheet_parts = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            
            # Obtener valores de celdas
            rows_text = []
            for row in ws.iter_rows(values_only=True):
                row_text = " | ".join(str(cell) if cell is not None else "" for cell in row)
                if row_text.strip():
                    rows_text.append(row_text)
            
            if rows_text:
                sheet_parts.append(f"--- Hoja: {sheet_name} ---\n" + "\n".join(rows_text))
        
        extracted_text = "\n\n".join(sheet_parts)
        print(f"✅ Excel procesado: {file_name} - {len(wb.sheetnames)} hojas, {len(extracted_text)} caracteres")
        
        return extracted_text if extracted_text else "[Hoja de calculo procesada pero no se pudo extraer texto]"
        
    except Exception as e:
        import traceback
        print(f"❌ Error al procesar Excel {file_name}:")
        print(traceback.format_exc())
        return f"[Error al procesar hoja de calculo: {str(e)}]"


def extract_text_from_pptx(content: str, file_name: str) -> str:
    """
    Extraer texto de una presentacion PowerPoint (.pptx) a partir de su contenido en base64
    
    Args:
        content: Contenido del archivo en base64 (con o sin prefijo data:)
        file_name: Nombre del archivo para logging
        
    Returns:
        Texto extraído de todas las diapositivas
    """
    try:
        from pptx import Presentation
        import base64
        from io import BytesIO
        import re
        
        print(f"🔍 Procesando PowerPoint: {file_name}")
        
        # Limpiar prefijo data: si existe
        if content.startswith('data:'):
            match = re.search(r'base64,(.+)', content)
            if match:
                content = match.group(1)
        
        # Decodificar contenido base64
        pptx_bytes = base64.b64decode(content)
        pptx_file = BytesIO(pptx_bytes)
        
        # Cargar presentacion
        prs = Presentation(pptx_file)
        
        # Extraer texto de cada diapositiva
        slide_parts = []
        for slide_num, slide in enumerate(prs.slides, 1):
            slide_text = []
            
            # Extraer texto de todas las formas
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    slide_text.append(shape.text)
            
            if slide_text:
                slide_parts.append(f"--- Diapositiva {slide_num} ---\n" + "\n".join(slide_text))
        
        extracted_text = "\n\n".join(slide_parts)
        print(f"✅ PowerPoint procesado: {file_name} - {len(prs.slides)} diapositivas, {len(extracted_text)} caracteres")
        
        return extracted_text if extracted_text else "[Presentacion procesada pero no se pudo extraer texto]"
        
    except Exception as e:
        import traceback
        print(f"❌ Error al procesar PowerPoint {file_name}:")
        print(traceback.format_exc())
        return f"[Error al procesar presentacion: {str(e)}]"


# --- Modelos de datos para la API ---

class HealthResponse(BaseModel):
    """Estado de salud del servicio con detalles de componentes"""
    status: str = Field(..., description="Estado general: healthy, degraded, unhealthy")
    timestamp: str = Field(..., description="Timestamp del health check")
    components: Dict[str, str] = Field(default_factory=dict, description="Estado de cada componente")
    alfred_core_initialized: bool = Field(..., description="Si Alfred Core esta inicializado")
    vectorstore_loaded: bool = Field(..., description="Si la base vectorial esta cargada")
    gpu_status: Optional[Dict[str, Any]] = Field(None, description="Estado detallado de GPU")
    is_fully_initialized: bool = Field(..., description="Si la inicializacion asincrona ha completado completamente (lifespan ready)")

# --- Inicializacion del nucleo de Alfred ---
alfred_core: Optional[AlfredCore] = None
_initialization_complete: bool = False  # Flag para indicar cuando initialize_async() ha terminado

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manejo del ciclo de vida de la aplicación"""
    global alfred_core
    global _initialization_complete
    
    # IMPORTANTE: Usar sys.stdout.flush() para forzar salida inmediata en Windows
    import sys
    
    print("\n" + "="*60, flush=True)
    print("Iniciando Alfred Backend API...", flush=True)
    print("="*60, flush=True)
    sys.stdout.flush()
    
    _initialization_complete = False  # Marcar como no listo
    
    try:
        # Inicializar el núcleo de Alfred con version refactorizada (async + optimizaciones)
        print("Creando instancia de AlfredCore...", flush=True)
        alfred_core = AlfredCore()
        
        print("Inicializando componentes async (lazy loading)...", flush=True)
        await alfred_core.initialize_async()
        
        # Establecer instancia global para endpoints modulares
        set_alfred_core_instance(alfred_core)
        
        print("\n" + "="*60, flush=True)
        print("Alfred Core Refactored inicializado correctamente", flush=True)
        print(f"  - Embedding Model: {alfred_core.embedding_model}", flush=True)
        print(f"  - Vector Store: {alfred_core.chroma_db_path}", flush=True)
        print(f"  - Optimizations: Incremental indexing + LRU cache + Adaptive chunking", flush=True)
        print("="*60 + "\n", flush=True)
        sys.stdout.flush()
        
        # MARCAR COMO COMPLETAMENTE LISTO SOLO DESPUES DE initialize_async()
        _initialization_complete = True
        print("INITIALIZATION COMPLETE: Backend completamente listo para procesar consultas", flush=True)
        sys.stdout.flush()
        
        # Establecer instancia compartida de alfred_core para endpoints modulares
        set_alfred_core_instance(alfred_core)
        
        yield
    except Exception as e:
        print(f"\nError al inicializar Alfred Core: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        _initialization_complete = False  # Marcar como fallido
        raise
    finally:
        print("\n" + "="*60, flush=True)
        print("Cerrando Alfred Backend API...", flush=True)
        print("="*60 + "\n", flush=True)
        sys.stdout.flush()
        # Aquí podrías agregar limpieza si es necesaria


backend_logger = get_logger("server")
rag_logger = get_logger("rag")
security_logger = get_logger("security")

# Log de inicio
backend_logger.info(f"Iniciando backend Alfred en {os.getenv('ALFRED_IP', 'Not found')}:{os.getenv('ALFRED_PORT', 'Not found')}")
rag_logger.info(f"Iniciando RAG en {os.getenv('ALFRED_RAG_IP', 'Not found')}:{os.getenv('ALFRED_RAG_PORT', 'Not found')}")
security_logger.info(f"Iniciando seguridad en {os.getenv('ALFRED_SECURITY_IP', 'Not found')}:{os.getenv('ALFRED_SECURITY_PORT', 'Not found')}")

# Inicio de la base de datos
init_db()

# --- Funciones auxiliares de cifrado ---

def ensure_personal_data_decrypted(data: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """
    Asegura que los datos personales esten descifrados antes de enviarlos al cliente
    
    Args:
        data: Diccionario con datos personales (potencialmente cifrados)
    
    Returns:
        Diccionario con datos descifrados o None
    """
    if not data:
        return None
    
    try:
        # Intentar descifrar cada campo
        decrypted = {}
        for key, value in data.items():
            if value and isinstance(value, str):
                try:
                    # Intentar descifrar
                    decrypted[key] = decrypt_data(value)
                    security_logger.debug(f"Campo {key} descifrado exitosamente")
                except Exception:
                    # Si falla, asumir que ya esta descifrado
                    decrypted[key] = value
            else:
                decrypted[key] = value
        return decrypted
    except Exception as e:
        security_logger.error(f"Error al descifrar datos personales: {e}")
        return data  # Devolver datos originales en caso de error

def log_personal_data_access(operation: str, data_keys: List[str], user_context: str = "API"):
    """
    Registra el acceso a datos personales para auditoria
    
    Args:
        operation: Tipo de operacion (read, write, delete)
        data_keys: Claves de los datos accedidos (rfc, curp, etc.)
        user_context: Contexto del usuario/cliente
    """
    security_logger.info(
        f"Acceso a datos personales: {operation} | "
        f"Campos: {', '.join(data_keys)} | "
        f"Contexto: {user_context} | "
        f"Timestamp: {datetime.now().isoformat()}"
    )

# --- Crear aplicación FastAPI ---
app = FastAPI(
    title="Alfred Backend API",
    description="Asistente personal inteligente con acceso a documentos locales",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc"  # ReDoc
)

# --- Configurar CORS para permitir peticiones desde C# ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especifica los orígenes permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Incluir routers de módulos ---

## Router de los endpoints de usuario
app.include_router(user_router)

## Router de los endpoints de conversaciones
app.include_router(conversations_router)

## Router de los endpoints de documentos
app.include_router(documents_router)

## Router de los endpoints de seguridad y cifrado
app.include_router(security_router)

## Router de los endpoints de gestion de modelos Ollama
app.include_router(ollama_router)

## Router de los endpoints de estado de GPU
app.include_router(gpu_router)

## Router de los endpoints de optimizaciones RAG
app.include_router(optimizations_router)

## Router de los endpoints de configuracion (modo y tema)
app.include_router(settings_router)

## Router de los endpoints de consultas
app.include_router(query_router)

## Router de los endpoints de historial
app.include_router(history_router)

## Router de los endpoints de mantenimiento
app.include_router(maintenance_router)

# --- Endpoints ---

@app.get("/", tags=["General"])
async def root():
    """Endpoint raíz - Información del servicio"""
    return {
        "service": "Alfred Backend API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", response_model=HealthResponse, tags=["General"])
async def health_check():
    """
    Verificar el estado de salud del servicio con detalles de componentes
    
    Retorna el estado de:
    - Alfred Core (inicializacion)
    - ChromaDB (base vectorial con conteo de documentos)
    - Ollama (LLM disponible)
    - GPU (si esta disponible y configurada)
    """
    health_status = "healthy"
    components = {}
    gpu_status_data = None
    
    # Check Alfred Core
    if alfred_core and alfred_core.is_initialized():
        components["alfred_core"] = "healthy"
    else:
        health_status = "unhealthy"
        components["alfred_core"] = "not_initialized"
    
    # Check ChromaDB
    try:
        if alfred_core and alfred_core.vector_manager and alfred_core.vector_manager.vectorstore:
            count = alfred_core.vector_manager.vectorstore._collection.count()
            components["chroma_db"] = f"healthy ({count} docs)"
        else:
            health_status = "degraded"
            components["chroma_db"] = "not_available"
    except Exception as e:
        health_status = "degraded"
        components["chroma_db"] = f"error: {str(e)[:50]}"
    
    # Check Ollama LLM
    try:
        if alfred_core and alfred_core.llm:
            components["ollama_llm"] = f"healthy (model: {alfred_core.model_name})"
        else:
            health_status = "degraded"
            components["ollama_llm"] = "not_available"
    except Exception as e:
        health_status = "degraded"
        components["ollama_llm"] = f"error: {str(e)[:50]}"
    
    # Check GPU
    gpu_status_dict = None
    if alfred_core:
        gpu_mgr = alfred_core.gpu_manager
        gpu_status_dict = {
            "gpu_available": gpu_mgr.has_gpu,
            "device_type": gpu_mgr.device_type,
            "device": gpu_mgr.device,
            "gpu_info": gpu_mgr.gpu_info,
            "memory_usage": gpu_mgr.get_memory_usage()
        }
        
        if gpu_mgr.has_gpu:
            components["gpu"] = f"available ({gpu_mgr.device_type})"
        else:
            components["gpu"] = "cpu_fallback"
    else:
        components["gpu"] = "unknown"
    
    return HealthResponse(
        status=health_status,
        timestamp=datetime.now().isoformat(),
        components=components,
        alfred_core_initialized=alfred_core is not None and alfred_core.is_initialized(),
        vectorstore_loaded=alfred_core.is_initialized() if alfred_core else False,
        gpu_status=gpu_status_dict,
        is_fully_initialized=_initialization_complete
    )

# --- Manejo de errores global ---
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Manejador global de excepciones mejorado
    
    Proporciona:
    - Error IDs unicos para tracking
    - Logging estructurado completo
    - Respuestas sanitizadas (sin stack traces sensibles)
    - Timestamp ISO para auditoria
    """
    import traceback
    
    # Generar ID unico para el error
    error_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    
    # Log completo del error con stack trace
    backend_logger.error(
        f"[{error_id}] Excepcion no manejada capturada",
        extra={
            "error_id": error_id,
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "request_path": str(request.url) if hasattr(request, 'url') else "unknown",
            "request_method": request.method if hasattr(request, 'method') else "unknown"
        }
    )
    backend_logger.error(f"[{error_id}] Stack trace:\n{traceback.format_exc()}")
    
    # Sanitizar mensaje de error para el cliente
    # Eliminar caracteres no-ASCII que puedan causar problemas
    error_msg = str(exc).encode('ascii', 'ignore').decode('ascii')
    if not error_msg or len(error_msg.strip()) == 0:
        error_msg = "Error interno del servidor"
    
    # Respuesta estructurada
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": error_msg,
            "error_id": error_id,
            "timestamp": datetime.now().isoformat(),
            "message": f"Error registrado con ID: {error_id}. Revisa los logs para mas detalles."
        }
    )

if __name__ == "__main__":
    import uvicorn
    
    # Obtener configuración desde variables de entorno
    host = os.getenv("ALFRED_HOST", "127.0.0.1")
    port = int(os.getenv("ALFRED_PORT", "8000"))
    # Auto-reload deshabilitado - usar modo desarrollo de uvicorn manualmente si es necesario
    reload = False
    
    print(f"""
    ============================================================
              Alfred Backend API Server
    ============================================================
      URL:    http://{host}:{port}
      Docs:   http://{host}:{port}/docs
      Health: http://{host}:{port}/health
    ============================================================
    """)
    
    uvicorn.run(
        "alfred_backend:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )
