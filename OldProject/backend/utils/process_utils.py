"""
Utilidades para gestion de procesos del sistema
Incluye funciones para manejar procesos Ollama
"""

import subprocess
import platform
from typing import List, Dict, Optional
from utils.logger import get_logger

logger = get_logger("process_utils")


def kill_ollama_process() -> bool:
    """
    Mata todos los procesos de Ollama en el sistema
    Multiplataforma: Windows, Linux, macOS
    
    Returns:
        True si se mataron procesos exitosamente, False en caso contrario
    """
    system = platform.system()
    
    try:
        if system == "Windows":
            return _kill_ollama_windows()
        elif system in ["Linux", "Darwin"]:  # Darwin = macOS
            return _kill_ollama_unix()
        else:
            logger.warning(f"Sistema operativo no soportado: {system}")
            return False
    except Exception as e:
        logger.error(f"Error al matar proceso Ollama: {e}")
        return False


def _kill_ollama_windows() -> bool:
    """
    Mata proceso Ollama en Windows usando taskkill
    
    Returns:
        True si se mato al menos un proceso, False en caso contrario
    """
    try:
        # Intentar matar ollama.exe
        result = subprocess.run(
            ["taskkill", "/F", "/IM", "ollama.exe"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            logger.info("Proceso ollama.exe terminado exitosamente")
            return True
        elif "not found" in result.stderr.lower() or "no se encontro" in result.stderr.lower():
            logger.info("Proceso ollama.exe no estaba corriendo")
            return True  # No es error si no estaba corriendo
        else:
            logger.warning(f"taskkill stderr: {result.stderr}")
            return False
    
    except subprocess.TimeoutExpired:
        logger.error("Timeout al intentar matar proceso Ollama")
        return False
    except FileNotFoundError:
        logger.error("taskkill no encontrado (Windows corrupto?)")
        return False
    except Exception as e:
        logger.error(f"Error al ejecutar taskkill: {e}")
        return False


def _kill_ollama_unix() -> bool:
    """
    Mata proceso Ollama en Linux/macOS usando pkill
    
    Returns:
        True si se mato al menos un proceso, False en caso contrario
    """
    try:
        # Intentar matar proceso ollama con pkill
        result = subprocess.run(
            ["pkill", "-9", "ollama"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # pkill retorna 0 si mato procesos, 1 si no encontro procesos
        if result.returncode in [0, 1]:
            if result.returncode == 0:
                logger.info("Proceso ollama terminado exitosamente")
            else:
                logger.info("Proceso ollama no estaba corriendo")
            return True
        else:
            logger.warning(f"pkill stderr: {result.stderr}")
            return False
    
    except subprocess.TimeoutExpired:
        logger.error("Timeout al intentar matar proceso Ollama")
        return False
    except FileNotFoundError:
        logger.error("pkill no encontrado (instalar psmisc)")
        return False
    except Exception as e:
        logger.error(f"Error al ejecutar pkill: {e}")
        return False


def is_ollama_running() -> bool:
    """
    Verifica si Ollama esta corriendo
    
    Returns:
        True si Ollama esta corriendo, False en caso contrario
    """
    system = platform.system()
    
    try:
        if system == "Windows":
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq ollama.exe"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return "ollama.exe" in result.stdout
        
        elif system in ["Linux", "Darwin"]:
            result = subprocess.run(
                ["pgrep", "ollama"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        
        else:
            logger.warning(f"Sistema operativo no soportado: {system}")
            return False
    
    except Exception as e:
        logger.error(f"Error al verificar si Ollama esta corriendo: {e}")
        return False


def get_ollama_processes() -> List[Dict[str, str]]:
    """
    Obtiene lista de procesos Ollama corriendo
    
    Returns:
        Lista de diccionarios con info de procesos: [{"pid": "1234", "name": "ollama.exe"}, ...]
    """
    system = platform.system()
    processes = []
    
    try:
        if system == "Windows":
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq ollama.exe", "/FO", "CSV"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            # Parsear salida CSV
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:  # Skip header
                for line in lines[1:]:
                    parts = line.replace('"', '').split(',')
                    if len(parts) >= 2:
                        processes.append({
                            "pid": parts[1],
                            "name": parts[0]
                        })
        
        elif system in ["Linux", "Darwin"]:
            result = subprocess.run(
                ["pgrep", "-l", "ollama"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            # Parsear salida: "PID name"
            lines = result.stdout.strip().split('\n')
            for line in lines:
                if line:
                    parts = line.split(None, 1)
                    if len(parts) >= 2:
                        processes.append({
                            "pid": parts[0],
                            "name": parts[1]
                        })
    
    except Exception as e:
        logger.error(f"Error al obtener procesos Ollama: {e}")
    
    return processes


def stop_ollama_gracefully(timeout: int = 5) -> bool:
    """
    Intenta detener Ollama de forma controlada usando API HTTP
    Si falla despues de timeout, usa kill_ollama_process()
    
    Args:
        timeout: Segundos a esperar antes de forzar terminacion
    
    Returns:
        True si Ollama se detuvo, False en caso contrario
    """
    try:
        import requests
        import time
        
        # Intentar detener via API (si existe endpoint)
        try:
            response = requests.post(
                "http://localhost:11434/api/shutdown",
                timeout=2
            )
            logger.info("Shutdown request enviado a Ollama API")
        except:
            pass  # API podria no tener endpoint de shutdown
        
        # Esperar a que termine gracefully
        start_time = time.time()
        while time.time() - start_time < timeout:
            if not is_ollama_running():
                logger.info("Ollama detenido gracefully")
                return True
            time.sleep(0.5)
        
        # Si no termino, forzar kill
        logger.warning(f"Ollama no termino en {timeout}s, forzando terminacion...")
        return kill_ollama_process()
    
    except Exception as e:
        logger.error(f"Error al detener Ollama gracefully: {e}")
        # Fallback: forzar kill
        return kill_ollama_process()
