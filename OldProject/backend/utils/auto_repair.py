# ============================================
# AUTO-REPARACION DE DEPENDENCIAS
# ============================================
# Proposito: Detectar y reparar automaticamente problemas comunes
# en el entorno de produccion
# ============================================

import sys
import subprocess
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Lock file para evitar reparaciones simultaneas
REPAIR_LOCK_FILE = Path(os.environ.get('TEMP', '/tmp')) / 'alfred_repair.lock'
REPAIR_TIMEOUT = 120  # 2 minutos


def acquire_repair_lock():
    """
    Intenta adquirir el lock de reparacion
    Returns:
        bool: True si adquirio el lock, False si ya esta bloqueado
    """
    try:
        # Si el lock existe y es reciente (menos de REPAIR_TIMEOUT), otro proceso esta reparando
        if REPAIR_LOCK_FILE.exists():
            age = time.time() - REPAIR_LOCK_FILE.stat().st_mtime
            if age < REPAIR_TIMEOUT:
                logger.info(f"[AUTO-REPAIR] Otro proceso esta reparando (lock age: {age:.1f}s)")
                return False
            else:
                logger.warning(f"[AUTO-REPAIR] Lock antiguo encontrado ({age:.1f}s), eliminando...")
                REPAIR_LOCK_FILE.unlink()
        
        # Crear lock file
        REPAIR_LOCK_FILE.touch()
        logger.info("[AUTO-REPAIR] Lock adquirido")
        return True
    except Exception as e:
        logger.error(f"[AUTO-REPAIR] Error al adquirir lock: {e}")
        return False


def release_repair_lock():
    """Libera el lock de reparacion"""
    try:
        if REPAIR_LOCK_FILE.exists():
            REPAIR_LOCK_FILE.unlink()
            logger.info("[AUTO-REPAIR] Lock liberado")
    except Exception as e:
        logger.error(f"[AUTO-REPAIR] Error al liberar lock: {e}")


def fix_jsonschema_error():
    """
    Corrige el error de jsonschema con referencing
    Error: referencing.exceptions.NoSuchResource: 'http://json-schema.org/draft-03/schema#'
    
    Solucion: Downgrade de jsonschema a version compatible
    """
    try:
        logger.info("[AUTO-REPAIR] Verificando compatibilidad de jsonschema...")
        
        # PRIMERO: Verificar version instalada con pip (no importar)
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "show", "jsonschema"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                # Extraer version
                for line in result.stdout.split('\n'):
                    if line.startswith('Version:'):
                        version = line.split(':')[1].strip()
                        logger.info(f"[AUTO-REPAIR] jsonschema version instalada: {version}")
                        
                        # Si es version 4.17.3 o compatible, asumimos que esta OK
                        if version.startswith('4.17') or version.startswith('4.16') or version.startswith('4.18'):
                            logger.info("[AUTO-REPAIR] jsonschema version compatible detectada")
                            return True
                        else:
                            logger.warning(f"[AUTO-REPAIR] jsonschema version {version} puede causar problemas")
                            # Continuar a intentar importar para confirmar
        except Exception as check_error:
            logger.warning(f"[AUTO-REPAIR] No se pudo verificar version: {check_error}")
        
        # SEGUNDO: Intentar importar y verificar si hay error
        try:
            import jsonschema
            from jsonschema import validators
            logger.info("[AUTO-REPAIR] jsonschema importado correctamente")
            return True
        except Exception as e:
            error_msg = str(e)
            if 'json-schema.org/draft-03/schema' in error_msg or 'NoSuchResource' in error_msg:
                logger.warning(f"[AUTO-REPAIR] Detectado error de jsonschema: {error_msg}")
                logger.info("[AUTO-REPAIR] Aplicando correccion automatica...")
                
                # Downgrade a version compatible
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "install", "jsonschema==4.17.3", "--quiet", "--force-reinstall"],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode == 0:
                    logger.info("[AUTO-REPAIR] jsonschema corregido exitosamente")
                    logger.info("[AUTO-REPAIR] Se requiere reinicio de la aplicacion")
                    return False  # Necesita reinicio
                else:
                    logger.error(f"[AUTO-REPAIR] Error al corregir jsonschema: {result.stderr}")
                    return False
            else:
                logger.error(f"[AUTO-REPAIR] Error desconocido en jsonschema: {e}")
                return False
                
    except Exception as e:
        logger.error(f"[AUTO-REPAIR] Error en fix_jsonschema_error: {e}")
        return False


def fix_chromadb_compatibility():
    """
    Verifica y corrige problemas de compatibilidad con ChromaDB
    """
    try:
        logger.info("[AUTO-REPAIR] Verificando ChromaDB...")
        
        import chromadb
        logger.info(f"[AUTO-REPAIR] ChromaDB version: {chromadb.__version__}")
        return True
        
    except Exception as e:
        logger.error(f"[AUTO-REPAIR] Error al verificar ChromaDB: {e}")
        
        # Intentar reinstalar ChromaDB
        try:
            logger.info("[AUTO-REPAIR] Reinstalando ChromaDB...")
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "chromadb==0.4.22", "--quiet"],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                logger.info("[AUTO-REPAIR] ChromaDB reinstalado exitosamente")
                return False  # Necesita reinicio
            else:
                logger.error(f"[AUTO-REPAIR] Error al reinstalar ChromaDB: {result.stderr}")
                return False
        except Exception as reinstall_error:
            logger.error(f"[AUTO-REPAIR] Error en reinstalacion: {reinstall_error}")
            return False


def run_auto_repair():
    """
    Ejecuta todas las reparaciones automaticas necesarias
    
    Returns:
        bool: True si todo esta OK, False si necesita reinicio
    """
    logger.info("[AUTO-REPAIR] Iniciando verificacion de sistema...")
    
    # Intentar adquirir lock
    if not acquire_repair_lock():
        logger.info("[AUTO-REPAIR] Otro proceso esta realizando reparaciones, esperando...")
        # Esperar a que el otro proceso termine (hasta 60 segundos)
        for i in range(60):
            time.sleep(1)
            if not REPAIR_LOCK_FILE.exists():
                logger.info("[AUTO-REPAIR] Reparacion completada por otro proceso")
                # Verificar si ahora esta OK
                if fix_jsonschema_error() and fix_chromadb_compatibility():
                    return True
                else:
                    return False  # Aun necesita reinicio
        
        logger.warning("[AUTO-REPAIR] Timeout esperando a otro proceso")
        return False
    
    try:
        needs_restart = False
        
        # Fix 1: jsonschema
        if not fix_jsonschema_error():
            needs_restart = True
        
        # Fix 2: ChromaDB (solo si jsonschema esta OK)
        if not needs_restart:
            if not fix_chromadb_compatibility():
                needs_restart = True
        
        if needs_restart:
            logger.info("[AUTO-REPAIR] Correcciones aplicadas. Reinicio automatico en progreso...")
            return False
        
        logger.info("[AUTO-REPAIR] Sistema verificado - Todo OK")
        return True
    
    finally:
        # Siempre liberar el lock
        release_repair_lock()


def get_repair_status():
    """
    Obtiene el estado actual de las dependencias criticas
    
    Returns:
        dict: Estado de cada componente
    """
    status = {
        'jsonschema': 'unknown',
        'chromadb': 'unknown',
        'overall': 'unknown'
    }
    
    try:
        import jsonschema
        from jsonschema import validators
        status['jsonschema'] = 'ok'
    except Exception as e:
        if 'json-schema.org/draft-03/schema' in str(e):
            status['jsonschema'] = 'needs_fix'
        else:
            status['jsonschema'] = 'error'
    
    try:
        import chromadb
        status['chromadb'] = 'ok'
    except:
        status['chromadb'] = 'error'
    
    # Estado general
    if status['jsonschema'] == 'ok' and status['chromadb'] == 'ok':
        status['overall'] = 'ok'
    elif status['jsonschema'] == 'needs_fix' or status['chromadb'] == 'needs_fix':
        status['overall'] = 'needs_repair'
    else:
        status['overall'] = 'error'
    
    return status


if __name__ == '__main__':
    # Configurar logging
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s'
    )
    
    # Ejecutar reparacion
    success = run_auto_repair()
    
    if success:
        print("\nSistema verificado - Sin problemas detectados")
        sys.exit(0)
    else:
        # NO imprimir mensaje al usuario - Electron maneja el reinicio automatico
        logger.info("Correcciones aplicadas - Exit code 3 para reinicio automatico")
        sys.exit(1)
