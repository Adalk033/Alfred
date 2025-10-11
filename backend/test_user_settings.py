"""
Test suite para configuraciones de usuario y foto de perfil
Valida los endpoints de /user/settings y /user/profile-picture
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'core'))

from db_manager import (
    init_db, 
    set_user_setting, 
    get_user_setting, 
    get_all_user_settings,
    delete_user_setting
)

def test_basic_settings():
    """Test CRUD basico de configuraciones"""
    print("\n" + "="*70)
    print("TEST 1: CRUD basico de configuraciones")
    print("="*70)
    
    # Crear configuracion string
    print("\n1.1 - Guardando configuracion tipo string...")
    success = set_user_setting('test_key', 'test_value', 'string')
    assert success, "Error al guardar configuracion string"
    print("✅ Configuracion string guardada")
    
    # Leer configuracion
    print("\n1.2 - Leyendo configuracion...")
    value = get_user_setting('test_key', default=None)
    assert value == 'test_value', f"Valor incorrecto: {value}"
    print(f"✅ Configuracion leida: {value}")
    
    # Actualizar configuracion
    print("\n1.3 - Actualizando configuracion...")
    success = set_user_setting('test_key', 'new_value', 'string')
    assert success, "Error al actualizar configuracion"
    value = get_user_setting('test_key', default=None)
    assert value == 'new_value', f"Valor no actualizado: {value}"
    print(f"✅ Configuracion actualizada: {value}")
    
    # Eliminar configuracion
    print("\n1.4 - Eliminando configuracion...")
    success = delete_user_setting('test_key')
    assert success, "Error al eliminar configuracion"
    value = get_user_setting('test_key', default='default_value')
    assert value == 'default_value', f"Configuracion no eliminada: {value}"
    print("✅ Configuracion eliminada correctamente")

def test_typed_settings():
    """Test de configuraciones con tipos de datos"""
    print("\n" + "="*70)
    print("TEST 2: Configuraciones con tipos de datos")
    print("="*70)
    
    # Integer
    print("\n2.1 - Guardando configuracion tipo int...")
    success = set_user_setting('keep_alive', 300, 'int')
    assert success, "Error al guardar int"
    value = get_user_setting('keep_alive', default=0, setting_type='int')
    assert value == 300, f"Valor incorrecto: {value}"
    assert isinstance(value, int), f"Tipo incorrecto: {type(value)}"
    print(f"✅ Int guardado y leido: {value} (tipo: {type(value).__name__})")
    
    # Float
    print("\n2.2 - Guardando configuracion tipo float...")
    success = set_user_setting('threshold', 0.85, 'float')
    assert success, "Error al guardar float"
    value = get_user_setting('threshold', default=0.0, setting_type='float')
    assert value == 0.85, f"Valor incorrecto: {value}"
    assert isinstance(value, float), f"Tipo incorrecto: {type(value)}"
    print(f"✅ Float guardado y leido: {value} (tipo: {type(value).__name__})")
    
    # Boolean
    print("\n2.3 - Guardando configuracion tipo bool...")
    success = set_user_setting('dark_mode', True, 'bool')
    assert success, "Error al guardar bool"
    value = get_user_setting('dark_mode', default=False, setting_type='bool')
    assert value is True, f"Valor incorrecto: {value}"
    assert isinstance(value, bool), f"Tipo incorrecto: {type(value)}"
    print(f"✅ Bool guardado y leido: {value} (tipo: {type(value).__name__})")
    
    # JSON
    print("\n2.4 - Guardando configuracion tipo json...")
    data = {'name': 'Alfred', 'version': '2.0', 'features': ['RAG', 'Chat', 'History']}
    success = set_user_setting('app_config', data, 'json')
    assert success, "Error al guardar json"
    value = get_user_setting('app_config', default={}, setting_type='json')
    assert value == data, f"Valor incorrecto: {value}"
    assert isinstance(value, dict), f"Tipo incorrecto: {type(value)}"
    print(f"✅ JSON guardado y leido: {value}")
    
    # Limpiar
    delete_user_setting('keep_alive')
    delete_user_setting('threshold')
    delete_user_setting('dark_mode')
    delete_user_setting('app_config')

def test_ollama_keep_alive():
    """Test de persistencia de keep_alive de Ollama"""
    print("\n" + "="*70)
    print("TEST 3: Ollama keep_alive timeout")
    print("="*70)
    
    # Guardar keep_alive
    print("\n3.1 - Guardando keep_alive = 300s...")
    success = set_user_setting('ollama_keep_alive', 300, 'int')
    assert success, "Error al guardar keep_alive"
    print("✅ Keep_alive guardado")
    
    # Leer keep_alive
    print("\n3.2 - Leyendo keep_alive...")
    value = get_user_setting('ollama_keep_alive', default=30, setting_type='int')
    assert value == 300, f"Valor incorrecto: {value}"
    print(f"✅ Keep_alive leido: {value}s")
    
    # Actualizar keep_alive
    print("\n3.3 - Actualizando keep_alive = 600s...")
    success = set_user_setting('ollama_keep_alive', 600, 'int')
    assert success, "Error al actualizar keep_alive"
    value = get_user_setting('ollama_keep_alive', default=30, setting_type='int')
    assert value == 600, f"Valor no actualizado: {value}"
    print(f"✅ Keep_alive actualizado: {value}s")
    
    # Limpiar
    delete_user_setting('ollama_keep_alive')

def test_profile_picture():
    """Test de foto de perfil y historial"""
    print("\n" + "="*70)
    print("TEST 4: Foto de perfil y historial")
    print("="*70)
    
    # Simular foto en Base64 (imagen pequeña)
    fake_image_1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    fake_image_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    
    # Guardar primera foto
    print("\n4.1 - Guardando primera foto de perfil...")
    success = set_user_setting('profile_picture', fake_image_1, 'string')
    assert success, "Error al guardar foto"
    print("✅ Foto guardada")
    
    # Leer foto
    print("\n4.2 - Leyendo foto de perfil...")
    value = get_user_setting('profile_picture', default=None)
    assert value == fake_image_1, "Foto no coincide"
    print(f"✅ Foto leida: {value[:50]}...")
    
    # Inicializar historial vacio
    print("\n4.3 - Inicializando historial...")
    success = set_user_setting('profile_picture_history', [], 'json')
    assert success, "Error al inicializar historial"
    history = get_user_setting('profile_picture_history', default=[], setting_type='json')
    assert history == [], "Historial no vacio"
    print("✅ Historial inicializado")
    
    # Simular cambio de foto (agregar foto actual al historial)
    print("\n4.4 - Cambiando foto (agregar al historial)...")
    current = get_user_setting('profile_picture', default=None)
    history = get_user_setting('profile_picture_history', default=[], setting_type='json')
    if current and current not in history:
        history.insert(0, current)
    set_user_setting('profile_picture_history', history, 'json')
    set_user_setting('profile_picture', fake_image_2, 'string')
    
    new_current = get_user_setting('profile_picture', default=None)
    new_history = get_user_setting('profile_picture_history', default=[], setting_type='json')
    
    assert new_current == fake_image_2, "Foto actual no actualizada"
    assert len(new_history) == 1, f"Historial deberia tener 1 foto, tiene {len(new_history)}"
    assert new_history[0] == fake_image_1, "Foto anterior no en historial"
    print(f"✅ Foto actualizada, historial tiene {len(new_history)} foto(s)")
    
    # Limpiar
    delete_user_setting('profile_picture')
    delete_user_setting('profile_picture_history')

def test_get_all_settings():
    """Test de obtener todas las configuraciones"""
    print("\n" + "="*70)
    print("TEST 5: Obtener todas las configuraciones")
    print("="*70)
    
    # Crear varias configuraciones
    print("\n5.1 - Creando multiples configuraciones...")
    set_user_setting('key1', 'value1', 'string')
    set_user_setting('key2', 42, 'int')
    set_user_setting('key3', True, 'bool')
    print("✅ Configuraciones creadas")
    
    # Obtener todas
    print("\n5.2 - Obteniendo todas las configuraciones...")
    all_settings = get_all_user_settings()
    assert len(all_settings) >= 3, f"Deberia haber al menos 3 configuraciones, hay {len(all_settings)}"
    print(f"✅ Se encontraron {len(all_settings)} configuraciones:")
    
    for setting in all_settings:
        print(f"  - {setting['key']} = {setting['value']} (tipo: {setting['type']}, actualizado: {setting['updated_at']})")
    
    # Limpiar
    delete_user_setting('key1')
    delete_user_setting('key2')
    delete_user_setting('key3')

def test_edge_cases():
    """Test de casos extremos"""
    print("\n" + "="*70)
    print("TEST 6: Casos extremos")
    print("="*70)
    
    # Key vacia
    print("\n6.1 - Intentando guardar key vacia...")
    try:
        success = set_user_setting('', 'value', 'string')
        print(f"  Resultado: {success}")
    except Exception as e:
        print(f"  ⚠️ Error esperado: {e}")
    
    # Valor muy largo (simulando imagen grande)
    print("\n6.2 - Guardando valor muy largo...")
    long_value = "x" * 100000  # 100KB de datos
    success = set_user_setting('long_value', long_value, 'string')
    assert success, "Error al guardar valor largo"
    value = get_user_setting('long_value', default=None)
    assert len(value) == 100000, f"Longitud incorrecta: {len(value)}"
    print(f"✅ Valor largo guardado y leido: {len(value)} caracteres")
    delete_user_setting('long_value')
    
    # Leer key inexistente
    print("\n6.3 - Leyendo key inexistente...")
    value = get_user_setting('nonexistent_key', default='default_value')
    assert value == 'default_value', f"Default no funciono: {value}"
    print(f"✅ Default aplicado correctamente: {value}")
    
    # Tipo incorrecto en conversion
    print("\n6.4 - Intentando leer string como int...")
    set_user_setting('string_key', 'not_a_number', 'string')
    try:
        value = get_user_setting('string_key', default=0, setting_type='int')
        print(f"  ⚠️ No deberia llegar aqui: {value}")
    except Exception as e:
        print(f"  ✅ Error esperado capturado: {type(e).__name__}")
    delete_user_setting('string_key')

def main():
    """Ejecutar todos los tests"""
    print("\n" + "="*70)
    print("INICIANDO TESTS DE CONFIGURACIONES DE USUARIO")
    print("="*70)
    
    try:
        # Inicializar base de datos
        print("\n🔧 Inicializando base de datos...")
        init_db()
        print("✅ Base de datos inicializada")
        
        # Ejecutar tests
        test_basic_settings()
        test_typed_settings()
        test_ollama_keep_alive()
        test_profile_picture()
        test_get_all_settings()
        test_edge_cases()
        
        print("\n" + "="*70)
        print("✅ TODOS LOS TESTS PASARON EXITOSAMENTE")
        print("="*70)
        
    except AssertionError as e:
        print("\n" + "="*70)
        print("❌ TEST FALLIDO")
        print("="*70)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    except Exception as e:
        print("\n" + "="*70)
        print("❌ ERROR INESPERADO")
        print("="*70)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
