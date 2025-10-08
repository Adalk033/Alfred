"""
Script de verificación de dependencias para Alfred Backend
Ejecuta este script antes de iniciar el servidor para detectar problemas
"""

import sys
from importlib import import_module

def check_module(module_name, package_name=None):
    """Verifica si un módulo está instalado"""
    try:
        import_module(module_name)
        print(f"[OK] {package_name or module_name}")
        return True
    except ImportError as e:
        print(f"[FAIL] {package_name or module_name} - {str(e)}")
        return False

def main():
    print("\n" + "="*60)
    print("  Verificación de Dependencias de Alfred")
    print("="*60 + "\n")
    
    # Dependencias críticas
    critical_modules = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("pydantic", "Pydantic"),
        ("dotenv", "python-dotenv"),
        ("langchain", "LangChain"),
        ("langchain_community", "LangChain Community"),
        ("langchain_core", "LangChain Core"),
        ("langchain_ollama", "LangChain Ollama"),
        ("langchain.chains", "LangChain Chains"),
        ("chromadb", "ChromaDB"),
        ("ollama", "Ollama Client"),
    ]
    
    # Verificar módulos críticos
    print("📦 Dependencias Críticas:")
    print("-" * 60)
    
    missing_critical = []
    for module, name in critical_modules:
        if not check_module(module, name):
            missing_critical.append(name)
    
    print()
    
    # Verificar importaciones específicas de Alfred
    print("🔧 Importaciones de Alfred:")
    print("-" * 60)
    
    alfred_imports = [
        ("langchain_community.vectorstores", "Chroma VectorStore"),
        ("langchain_community.document_loaders", "Document Loaders"),
        ("langchain_text_splitters", "Text Splitters"),
        ("langchain_core.prompts", "Prompts"),
    ]
    
    missing_alfred = []
    for module, name in alfred_imports:
        if not check_module(module, name):
            missing_alfred.append(name)
    
    print()
    
    # Intentar importar archivos de Alfred
    print("📄 Módulos de Alfred:")
    print("-" * 60)
    
    alfred_modules = [
        ("config", "config.py"),
        ("functionsToHistory", "functionsToHistory.py"),
        ("alfred_core", "alfred_core.py"),
    ]
    
    missing_modules = []
    for module, name in alfred_modules:
        if not check_module(module, name):
            missing_modules.append(name)
    
    print()
    
    # Resumen
    print("="*60)
    print("  Resumen")
    print("="*60)
    
    if not missing_critical and not missing_alfred and not missing_modules:
        print("\n¡Todo está correctamente instalado!")
        print("\nPuedes iniciar el servidor con:")
        print("   python alfred_backend.py")
        print("   o")
        print("   .\\start_alfred_server.ps1")
        return 0
    else:
        print("\nSe encontraron problemas:\n")
        
        if missing_critical:
            print("Dependencias críticas faltantes:")
            for dep in missing_critical:
                print(f"   - {dep}")
            print("\nSolución:")
            print("   pip install -r requirements_core.txt")
            print()
        
        if missing_alfred:
            print("Importaciones de Alfred con problemas:")
            for dep in missing_alfred:
                print(f"   - {dep}")
            print("\n💡 Puede ser un problema de versión. Intenta:")
            print("   pip install --upgrade langchain langchain-community")
            print()
        
        if missing_modules:
            print("🟠 Archivos de Alfred faltantes:")
            for mod in missing_modules:
                print(f"   - {mod}")
            print("\n💡 Asegúrate de estar en el directorio correcto de Alfred")
            print()
        
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n⚠️ Verificación cancelada")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Error durante la verificación: {e}")
        sys.exit(1)
