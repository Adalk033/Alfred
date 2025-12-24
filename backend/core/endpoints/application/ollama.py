# ====================================
# ENDPOINTS DE GESTION DE MODELOS OLLAMA
# ====================================

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from datetime import datetime
import subprocess
from utils.logger import get_logger
from endpoints.shared_state import get_alfred_core_instance

# Crear router para este modulo
router = APIRouter()

# Logger
backend_logger = get_logger("ollama")

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class OllamaKeepAliveRequest(BaseModel):
    """Solicitud para actualizar el keep_alive de Ollama"""
    seconds: int = Field(..., description="Tiempo en segundos (0-3600)", ge=0, le=3600)

class OllamaKeepAliveResponse(BaseModel):
    """Respuesta con el keep_alive actual"""
    keep_alive_seconds: int = Field(..., description="Tiempo en segundos")
    description: str = Field(..., description="Descripcion del comportamiento")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/ollama/models/list", tags=["Modelos"])
async def list_ollama_models():
    """
    Listar todos los modelos instalados en Ollama
    
    Ejecuta 'ollama list' y retorna la lista de modelos disponibles
    con sus detalles (nombre, tamaño, fecha de modificacion)
    """
    import subprocess
    import json
    
    try:
        # Ejecutar comando ollama list
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=500, 
                detail=f"Error al ejecutar ollama list: {result.stderr}"
            )
        
        # Parsear la salida
        lines = result.stdout.strip().split('\n')
        
        if len(lines) < 1:  # Al menos un modelo
            return {
                "models": [],
                "count": 0,
                "message": "No hay modelos instalados"
            }
        
        # Procesar todas las lineas (saltar header si existe)
        models = []
        for line in lines:
            # Limpiar la linea y dividir por multiples espacios
            line = line.strip()
            if not line:
                continue
            
            # Separar por espacios multiples (usa split sin argumentos)
            parts = line.split()
            
            # Saltar el header (primera linea con NAME, ID, SIZE, MODIFIED)
            if parts[0] == 'NAME' or parts[0] == 'name':
                continue
            
            if len(parts) >= 4:
                model_name = parts[0]
                model_id = parts[1]
                # El tamano son 2 partes: numero + unidad (ej: 669 MB)
                size = f"{parts[2]} {parts[3]}" if len(parts) > 3 else parts[2]
                # Los ultimos elementos son la fecha/tiempo (despues del tamano)
                modified = ' '.join(parts[4:]) if len(parts) > 4 else ""
                
                models.append({
                    "name": model_name,
                    "id": model_id,
                    "size": size,
                    "modified": modified
                })
        
        backend_logger.info(f"Modelos Ollama encontrados: {len(models)}")
        
        return {
            "models": models,
            "count": len(models),
            "timestamp": datetime.now().isoformat()
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timeout al listar modelos de Ollama")
    except Exception as e:
        backend_logger.error(f"Error al listar modelos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al listar modelos: {str(e)}")

@router.post("/ollama/models/download", tags=["Modelos"])
async def download_ollama_model(background_tasks: BackgroundTasks, model_name: str):
    """
    Descargar un modelo de Ollama
    
    Ejecuta 'ollama pull <model_name>' en segundo plano.
    El proceso puede tardar varios minutos dependiendo del tamaño del modelo.
    
    - **model_name**: Nombre del modelo a descargar (ej: llama2, mistral, gemma2:9b)
    
    La descarga se ejecuta en segundo plano y el endpoint retorna inmediatamente.
    """
    import subprocess
    import re
    from db_manager import save_model_download_history, update_model_download_progress
    
    if not model_name or model_name.strip() == "":
        raise HTTPException(status_code=400, detail="El nombre del modelo es requerido")
    
    # Función para ejecutar en segundo plano
    def download_model_background():
        import traceback
        try:
            print(f"[DEBUG] Iniciando descarga del modelo: {model_name}")
            backend_logger.info(f"Iniciando descarga del modelo: {model_name}")
            
            # Guardar inicio de descarga en BD
            try:
                print(f"[DEBUG] Guardando en BD: {model_name}")
                save_model_download_history(model_name, 'downloading', 'Descarga iniciada', 0)
                print(f"[DEBUG] Guardado exitoso en BD")
            except Exception as e:
                print(f"[DEBUG ERROR] Error al guardar historial: {str(e)}")
                print(f"[DEBUG ERROR] Traceback: {traceback.format_exc()}")
                backend_logger.error(f"Error al guardar historial: {str(e)}")
            except Exception as e:
                backend_logger.error(f"Error al guardar historial: {str(e)}")
            
            # Ejecutar comando ollama pull con captura de output en tiempo real
            process = subprocess.Popen(
                ["ollama", "pull", model_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                encoding='utf-8',
                errors='replace'  # Manejar caracteres especiales de Windows
            )
            
            # Leer output linea por linea para capturar progreso
            last_progress = 0
            last_clean_message = ""
            
            for line in process.stdout:
                # Limpieza simple de caracteres de control
                # Remover códigos ANSI comunes: [K, [A, [1G, [?25h, etc
                clean_line = line
                for code in ['[K', '[A', '[1G', '[?25h', '[?25l', '[?2026l', '[?2026h']:
                    clean_line = clean_line.replace(code, '')
                
                # Remover otros caracteres de control
                clean_line = ''.join(char for char in clean_line if char.isprintable() or char in '\n\r\t')
                clean_line = clean_line.strip()
                
                if not clean_line or clean_line == 'pulling manifest':
                    continue
                
                # Intentar extraer porcentaje de progreso
                if '%' in clean_line:
                    try:
                        # Buscar el porcentaje (patrón simple)
                        percent_pos = clean_line.find('%')
                        if percent_pos > 0:
                            # Buscar hacia atrás hasta encontrar el número
                            start = percent_pos - 1
                            while start >= 0 and (clean_line[start].isdigit() or clean_line[start] == ' '):
                                start -= 1
                            progress_str = clean_line[start+1:percent_pos].strip()
                            
                            if progress_str.isdigit():
                                progress = int(progress_str)
                                
                                # Crear mensaje simple sin caracteres especiales
                                # Remover bloques visuales █ ▕ ▏
                                simple_message = clean_line.replace('█', '').replace('▕', '').replace('▏', '')
                                simple_message = ' '.join(simple_message.split())  # Normalizar espacios
                                
                                # Limitar longitud del mensaje
                                if len(simple_message) > 100:
                                    simple_message = simple_message[:97] + '...'
                                
                                if progress != last_progress:
                                    last_progress = progress
                                    last_clean_message = simple_message
                                    update_model_download_progress(model_name, progress, simple_message)
                                    print(f"[DEBUG] Progreso: {progress}%")
                                    backend_logger.info(f"Progreso: {progress}%")
                    except Exception as e:
                        print(f"[DEBUG] Error parseando: {str(e)}")
                        pass
            
            # Esperar a que termine el proceso
            return_code = process.wait()
            
            print(f"[DEBUG] Proceso terminado con código: {return_code}")
            
            if return_code == 0:
                print(f"[DEBUG] Descarga exitosa, guardando en BD como completed...")
                backend_logger.info(f"Modelo {model_name} descargado exitosamente")
                
                # Actualizar BD con exito
                try:
                    save_model_download_history(model_name, 'completed', 'Descarga completada', 100)
                    print(f"[DEBUG] Estado 'completed' guardado exitosamente")
                except Exception as e:
                    print(f"[DEBUG ERROR] Error al guardar completed: {str(e)}")
                    backend_logger.error(f"Error al actualizar historial: {str(e)}")
                    import traceback
                    print(f"[DEBUG ERROR] Traceback: {traceback.format_exc()}")
            else:
                error_msg = f"Error al descargar modelo (return code: {return_code})"
                print(f"[DEBUG] Error en descarga: {error_msg}")
                backend_logger.error(f"Error al descargar modelo {model_name}: {error_msg}")
                
                # Guardar error en BD
                try:
                    save_model_download_history(model_name, 'failed', error_msg, last_progress)
                except Exception as e:
                    backend_logger.error(f"Error al guardar error en historial: {str(e)}")
                
        except Exception as e:
            backend_logger.error(f"Excepcion al descargar modelo {model_name}: {str(e)}")
            try:
                save_model_download_history(model_name, 'failed', str(e), 0)
            except:
                pass
    
    # Agregar tarea en segundo plano
    background_tasks.add_task(download_model_background)
    
    # Responder inmediatamente
    return {
        "status": "downloading",
        "message": f"Descarga de {model_name} iniciada en segundo plano. Esto puede tardar varios minutos.",
        "model_name": model_name,
        "timestamp": datetime.now().isoformat()
    }

@router.delete("/ollama/models/{model_name}", tags=["Modelos"])
async def delete_ollama_model(model_name: str):
    """
    Eliminar un modelo de Ollama
    
    Ejecuta 'ollama rm <model_name>' para eliminar el modelo del sistema.
    
    - **model_name**: Nombre del modelo a eliminar (debe estar instalado)
    """
    import subprocess
    from db_manager import save_model_download_history
    
    if not model_name or model_name.strip() == "":
        raise HTTPException(status_code=400, detail="El nombre del modelo es requerido")
    
    try:
        backend_logger.info(f"Eliminando modelo: {model_name}")
        
        # Ejecutar comando ollama rm
        result = subprocess.run(
            ["ollama", "rm", model_name],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            backend_logger.info(f"Modelo {model_name} eliminado exitosamente")
            
            # Guardar en historial
            try:
                save_model_download_history(model_name, 'deleted', 'Modelo eliminado')
            except Exception as e:
                backend_logger.error(f"Error al guardar en historial: {str(e)}")
            
            return {
                "status": "success",
                "message": f"Modelo {model_name} eliminado exitosamente",
                "model_name": model_name
            }
        else:
            error_msg = result.stderr or "Error desconocido"
            backend_logger.error(f"Error al eliminar modelo: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
            
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timeout al eliminar modelo")
    except HTTPException:
        raise
    except Exception as e:
        backend_logger.error(f"Error al eliminar modelo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar modelo: {str(e)}")

@router.get("/ollama/models/download-history", tags=["Modelos"])
async def get_model_download_history():
    """
    Obtener el historial de descargas de modelos
    
    Retorna todas las descargas registradas en la base de datos
    con su estado (downloading, completed, failed, deleted)
    """
    try:
        from db_manager import get_model_download_history
        
        history = get_model_download_history()
        
        return {
            "history": history,
            "count": len(history),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        backend_logger.error(f"Error al obtener historial: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener historial: {str(e)}")

@router.get("/ollama/models/status/{model_name}", tags=["Modelos"])
async def get_model_download_status_endpoint(model_name: str):
    """
    Obtener el estado actual de descarga de un modelo especifico
    
    Util para polling y obtener progreso en tiempo real durante la descarga.
    
    - **model_name**: Nombre del modelo
    
    Retorna el ultimo estado del modelo con su progreso (0-100)
    """
    try:
        from db_manager import get_model_download_status
        
        status = get_model_download_status(model_name)
        
        if status:
            return {
                "found": True,
                "model_name": model_name,
                "status": status['status'],
                "progress": status['progress'],
                "message": status['message'],
                "updated_at": status['updated_at']
            }
        else:
            return {
                "found": False,
                "model_name": model_name,
                "status": "not_found",
                "progress": 0,
                "message": "No hay informacion de descarga para este modelo"
            }
        
    except Exception as e:
        backend_logger.error(f"Error al obtener estado de modelo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener estado: {str(e)}")

@router.post("/ollama/stop", tags=["Configuración"])
async def stop_ollama(background_tasks: BackgroundTasks):
    """
    Detener el servicio de Ollama manualmente para liberar recursos
    
    Ejecuta el comando 'ollama stop <modelo>' para descargar el modelo de la memoria
    Se ejecuta en segundo plano para no bloquear la respuesta
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    # Obtener el modelo actual
    current_model = alfred_core.get_current_model()
    
    # Función para ejecutar en segundo plano
    def stop_ollama_background():
        try:
            print(f"[Background] Intentando detener modelo: {current_model}")
            
            # Ejecutar comando ollama stop con el nombre del modelo
            result = subprocess.run(
                ["ollama", "stop", current_model],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            print(f"[Background] Resultado del comando: returncode={result.returncode}")
            print(f"[Background] stdout: {result.stdout}")
            print(f"[Background] stderr: {result.stderr}")
            
            if result.returncode == 0:
                print(f"[Background] Modelo {current_model} detenido exitosamente")
            else:
                print(f"[Background] Error al detener modelo: {result.stderr}")
                
        except Exception as e:
            print(f"[Background] Excepción al detener Ollama: {str(e)}")
    
    # Agregar tarea en segundo plano
    background_tasks.add_task(stop_ollama_background)
    
    # Responder inmediatamente sin esperar
    return {
        "status": "success",
        "message": f"Deteniendo modelo {current_model} en segundo plano. Los recursos se liberaran en unos segundos.",
        "model": current_model
    }

@router.get("/ollama/keep-alive", response_model=OllamaKeepAliveResponse, tags=["Configuración"])
async def get_ollama_keep_alive():
    """
    Obtener el tiempo de keep_alive actual de Ollama
    
    El keep_alive controla cuanto tiempo Ollama mantiene el modelo en memoria
    despues de usarlo. Despues de este tiempo sin uso, el modelo se descarga
    automaticamente para liberar recursos.
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        keep_alive = alfred_core.get_ollama_keep_alive()
        
        if keep_alive == 0:
            description = "El modelo se descarga inmediatamente despues de cada uso"
        elif keep_alive < 60:
            description = f"El modelo permanece en memoria {keep_alive} segundos despues de cada uso"
        elif keep_alive < 3600:
            minutes = keep_alive // 60
            description = f"El modelo permanece en memoria {minutes} minuto(s) despues de cada uso"
        else:
            hours = keep_alive // 3600
            description = f"El modelo permanece en memoria {hours} hora(s) despues de cada uso"
        
        return OllamaKeepAliveResponse(
            keep_alive_seconds=keep_alive,
            description=description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener keep_alive: {str(e)}")

@router.put("/ollama/keep-alive", tags=["Configuración"])
async def set_ollama_keep_alive(request: OllamaKeepAliveRequest):
    """
    Actualizar el tiempo de keep_alive de Ollama
    
    - **seconds**: Tiempo en segundos (0-3600)
        - 0: Descargar el modelo inmediatamente despues de cada uso
        - 1-3600: Mantener el modelo en memoria durante este tiempo
    
    Valores recomendados:
    - 0s: Para liberar memoria inmediatamente (uso ocasional)
    - 30s-60s: Para uso regular con pausas cortas
    - 300s (5min): Para sesiones de trabajo activas
    - 1800s (30min): Para uso prolongado sin pausas
    """
    alfred_core = get_alfred_core_instance()
    
    if not alfred_core or not alfred_core.is_initialized():
        raise HTTPException(status_code=503, detail="Alfred Core no esta inicializado")
    
    try:
        success = alfred_core.set_ollama_keep_alive(request.seconds)
        
        if not success:
            raise HTTPException(status_code=400, detail="No se pudo actualizar el keep_alive")
        
        return {
            "status": "success",
            "message": f"keep_alive actualizado a {request.seconds} segundos",
            "keep_alive_seconds": request.seconds
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar keep_alive: {str(e)}")
