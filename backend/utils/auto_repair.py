# ============================================
# AUTO-REPARACION DE DEPENDENCIAS
# ============================================
# Proposito: Detectar y reparar automaticamente problemas comunes
# en el entorno de produccion
# ============================================

import sys
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def fix_jsonschema_error():
    """
    Corrige el error de jsonschema con referencing
    Error: referencing.exceptions.NoSuchResource: 'http://json-schema.org/draft-03/schema#'
    
    Solucion: Downgrade de jsonschema a version compatible
    """
    try:
        logger.info("[AUTO-REPAIR] Verificando compatibilidad de jsonschema...")
        
        # Intentar importar y verificar si hay error
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
                    [sys.executable, "-m", "pip", "install", "jsonschema==4.17.3", "--quiet"],
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
    
    needs_restart = False
    
    # Fix 1: jsonschema
    if not fix_jsonschema_error():
        needs_restart = True
    
    # Fix 2: ChromaDB (solo si jsonschema esta OK)
    if not needs_restart:
        if not fix_chromadb_compatibility():
            needs_restart = True
    
    if needs_restart:
        logger.warning("[AUTO-REPAIR] Se aplicaron correcciones. Reinicia la aplicacion.")
        return False
    
    logger.info("[AUTO-REPAIR] Sistema verificado - Todo OK")
    return True


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
        print("\nSe aplicaron correcciones - Por favor reinicia la aplicacion")
        sys.exit(1)
