"""
Utilidades compartidas entre endpoints
"""
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from alfred_core import AlfredCore

# Referencia global a alfred_core (se establece desde alfred_backend.py)
_alfred_core_instance: Optional['AlfredCore'] = None

def set_alfred_core_instance(core: 'AlfredCore'):
    """
    Establecer la instancia global de alfred_core
    
    Esta funcion es llamada desde alfred_backend.py durante la inicializacion
    """
    global _alfred_core_instance
    _alfred_core_instance = core

def get_alfred_core_instance() -> Optional['AlfredCore']:
    """
    Obtener la instancia global de alfred_core
    
    Returns:
        Instancia de AlfredCore o None si no esta inicializado
    """
    return _alfred_core_instance

def is_alfred_core_initialized() -> bool:
    """
    Verificar si alfred_core esta inicializado
    
    Returns:
        True si alfred_core esta disponible e inicializado
    """
    return _alfred_core_instance is not None and _alfred_core_instance.is_initialized()
