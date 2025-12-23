#!/bin/bash
# Script para instalar dependencias y ejecutar la app Electron de Alfred
# Este script prepara todo lo necesario para ejecutar la aplicacion

echo -e "\033[0;36m╔══════════════════════════════════════════════════════╗\033[0m"
echo -e "\033[0;36m║     Alfred Electron - Instalacion y Ejecucion        ║\033[0m"
echo -e "\033[0;36m╚══════════════════════════════════════════════════════╝\033[0m"
echo ""

# Verificar Node.js
echo -e "\033[0;33m🔍 Verificando Node.js...\033[0m"
if command -v node &> /dev/null; then
    nodeVersion=$(node --version)
    echo -e "\033[0;32m✅ Node.js $nodeVersion instalado\033[0m"
else
    echo -e "\033[0;31m❌ Node.js no esta instalado\033[0m"
    echo -e "\033[0;33m   Descargalo desde: https://nodejs.org/\033[0m"
    echo -e "\033[0;33m   O instala con: sudo apt install nodejs npm\033[0m"
    echo -e "\033[0;33m   Recomendado: Version LTS\033[0m"
    read -p "Presiona Enter para salir..."
    exit 1
fi

# Verificar npm
echo -e "\033[0;33m🔍 Verificando npm...\033[0m"
if command -v npm &> /dev/null; then
    npmVersion=$(npm --version)
    echo -e "\033[0;32m✅ npm $npmVersion instalado\033[0m"
else
    echo -e "\033[0;31m❌ npm no esta disponible\033[0m"
    echo -e "\033[0;33m   Instala con: sudo apt install npm\033[0m"
    read -p "Presiona Enter para salir..."
    exit 1
fi

echo ""

# Verificar Python portable
echo -e "\033[0;33m🔍 Verificando Python portable...\033[0m"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
pythonPortablePath="$SCRIPT_DIR/backend/python-portable/python"

if [ -f "$pythonPortablePath" ]; then
    pythonVersion=$($pythonPortablePath --version 2>&1)
    echo -e "\033[0;32m✅ Python portable $pythonVersion\033[0m"
elif command -v python3 &> /dev/null; then
    pythonVersion=$(python3 --version 2>&1)
    echo -e "\033[0;32m✅ Python del sistema $pythonVersion\033[0m"
else
    echo -e "\033[0;33m⚠️  Python portable no encontrado en backend/python-portable/\033[0m"
    echo -e "\033[0;37m   La aplicacion intentara verificarlo al iniciar\033[0m"
fi

echo ""

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "\033[0;33m📦 Instalando dependencias...\033[0m"
    echo -e "\033[0;37m   Esto puede tardar unos minutos la primera vez...\033[0m"
    echo ""
    
    npm install
    
    if [ $? -ne 0 ]; then
        echo ""
        echo -e "\033[0;31m❌ Error al instalar dependencias\033[0m"
        read -p "Presiona Enter para salir..."
        exit 1
    fi
    
    echo ""
    echo -e "\033[0;32m✅ Dependencias instaladas correctamente\033[0m"
else
    echo -e "\033[0;32m✅ Dependencias ya instaladas\033[0m"
fi

echo ""

# Verificar servidor de Alfred
echo -e "\033[0;33m🔍 Verificando servidor de Alfred...\033[0m"
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://localhost:8000/health" | grep -q "200"; then
    echo -e "\033[0;32m✅ Servidor de Alfred esta activo\033[0m"
else
    echo -e "\033[0;33m⚠️  Servidor no detectado\033[0m"
    echo -e "\033[0;37mEl servidor sera iniciado...\033[0m"
fi

echo ""
echo -e "\033[0;36m🚀 Iniciando Alfred Electron con modo debug...\033[0m"
echo -e "\033[0;37m   DevTools Debugger: chrome://inspect\033[0m"
echo ""
sleep 1

# Ejecutar la aplicacion con inspector
npm run dev
