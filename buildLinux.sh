#!/bin/bash
# ============================================
# SCRIPT: Build para Debian (.deb)
# ============================================
# Proposito: Construir paquete .deb para Debian/Ubuntu
# Uso: ./buildLinux.sh [-f|--force] [-s|--skip-clean]
# Nota: Alfred instalara Python/venv automaticamente en primer inicio
# ============================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

# Parametros
FORCE=false
SKIP_CLEAN=false

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -s|--skip-clean)
            SKIP_CLEAN=true
            shift
            ;;
        *)
            echo -e "${RED}Argumento desconocido: $1${NC}"
            exit 1
            ;;
    esac
done

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${CYAN}======================================================${NC}"
echo -e "${CYAN}    Alfred Electron - Build para Debian (.deb)        ${NC}"
echo -e "${CYAN}======================================================${NC}\n"

# Confirmacion del usuario
if [ "$FORCE" = false ]; then
    echo -e "${YELLOW}Este script construira Alfred para Debian (.deb)${NC}"
    echo ""
    echo -e "${CYAN}Requisitos:${NC}"
    echo -e "${WHITE}  - Node.js y Yarn/npm instalados${NC}"
    echo -e "${WHITE}  - Dependencias de Electron Builder${NC}"
    echo -e "${WHITE}  - Espacio en disco: ~500 MB${NC}"
    echo ""
    echo -e "${CYAN}Se generara:${NC}"
    echo -e "${GREEN}  -> dist/Alfred_x.x.x_amd64.deb${NC}"
    echo ""
    echo -e "${CYAN}Nota:${NC}"
    echo -e "${WHITE}  Alfred instalara Python y dependencias automaticamente${NC}"
    echo -e "${WHITE}  en el primer inicio dentro de un entorno virtual (venv)${NC}"
    echo ""
    
    read -p "Deseas continuar? (s/n): " confirmation
    if [ "$confirmation" != "s" ]; then
        echo -e "\n${RED}Operacion cancelada por el usuario.${NC}"
        exit 0
    fi
fi

# ============================================
# FASE 1: LIMPIEZA (OPCIONAL)
# ============================================
if [ "$SKIP_CLEAN" = false ]; then
    echo -e "\n${YELLOW}======================================================${NC}"
    echo -e "${YELLOW}  FASE 1: Limpieza de Build Anterior                 ${NC}"
    echo -e "${YELLOW}======================================================${NC}\n"

    DIST_PATH="$SCRIPT_DIR/dist"
    
    if [ -d "$DIST_PATH" ]; then
        echo -e "${CYAN}Limpiando build anterior...${NC}"
        rm -rf "$DIST_PATH"
        echo -e "${GREEN}   Carpeta dist eliminada${NC}"
    else
        echo -e "${GREEN}   Sin builds anteriores${NC}"
    fi
fi

# ============================================
# FASE 2: VERIFICACION DE DEPENDENCIAS NODE
# ============================================
echo -e "\n${YELLOW}======================================================${NC}"
echo -e "${YELLOW}  FASE 2: Verificacion de Dependencias Node           ${NC}"
echo -e "${YELLOW}======================================================${NC}\n"

NODE_MODULES_PATH="$SCRIPT_DIR/node_modules"

if [ ! -d "$NODE_MODULES_PATH" ]; then
    echo -e "${CYAN}Instalando dependencias de Node.js...${NC}"
    
    if command -v yarn &> /dev/null; then
        yarn install
    else
        npm install
    fi
    
    if [ $? -ne 0 ]; then
        echo -e "\n${RED}Error al instalar dependencias${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}   Dependencias instaladas${NC}"
else
    echo -e "${GREEN}Dependencias Node.js ya instaladas${NC}"
fi

# ============================================
# FASE 3: BUILD PARA DEBIAN
# ============================================
echo -e "\n${YELLOW}======================================================${NC}"
echo -e "${YELLOW}  FASE 3: Construccion para Debian (.deb)            ${NC}"
echo -e "${YELLOW}======================================================${NC}\n"

echo -e "${CYAN}Construyendo paquete .deb para Debian...${NC}"
echo ""
echo -e "${WHITE}   Plataforma objetivo: Linux (x64)${NC}"
echo -e "${WHITE}   Formato: .deb (Debian/Ubuntu)${NC}"
echo -e "${GRAY}   Tiempo estimado: 5-10 minutos${NC}"
echo -e "${GRAY}   Por favor espera...${NC}"
echo ""

BUILD_START_TIME=$(date +%s)

# Ejecutar build para deb
if command -v yarn &> /dev/null; then
    yarn run electron-builder --linux deb
else
    npx electron-builder --linux deb
fi

BUILD_EXIT_CODE=$?
BUILD_END_TIME=$(date +%s)
BUILD_DURATION=$(( (BUILD_END_TIME - BUILD_START_TIME) / 60 ))

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}Error al construir para Debian${NC}"
    echo ""
    echo -e "${YELLOW}Posibles causas:${NC}"
    echo -e "${WHITE}  - Falta configuracion en package.json${NC}"
    echo -e "${WHITE}  - Dependencias de Electron Builder incompletas${NC}"
    echo -e "${WHITE}  - Problemas con iconos (assets/icon.png)${NC}"
    echo ""
    exit 1
fi

# ============================================
# FASE 4: VERIFICACION DEL BUILD
# ============================================
echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  FASE 4: Verificacion del Build                     ${NC}"
echo -e "${GREEN}======================================================${NC}\n"

DIST_PATH="$SCRIPT_DIR/dist"
DEB_FILE=$(find "$DIST_PATH" -name "*.deb" -type f 2>/dev/null | head -n 1)

if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
    DEB_SIZE=$(du -m "$DEB_FILE" | cut -f1)
    DEB_NAME=$(basename "$DEB_FILE")
    
    echo -e "${GREEN}Build para Debian completado exitosamente${NC}"
    echo ""
    echo -e "${CYAN}Informacion del Build:${NC}"
    echo -e "${WHITE}   Archivo:     $DEB_NAME${NC}"
    echo -e "${WHITE}   Tamano:      ${DEB_SIZE} MB${NC}"
    echo -e "${WHITE}   Duracion:    ${BUILD_DURATION} minutos${NC}"
    echo -e "${WHITE}   Plataforma:  Linux x64${NC}"
    echo -e "${WHITE}   Formato:     .deb (Debian/Ubuntu)${NC}"
    echo -e "${GRAY}   Ruta:        $DEB_FILE${NC}"
    echo ""
    
    # Validar tamano minimo
    if [ "$DEB_SIZE" -lt 50 ]; then
        echo -e "${YELLOW}ADVERTENCIA: El paquete .deb parece muy pequeno (${DEB_SIZE} MB)${NC}"
        echo -e "${GRAY}   Tamano esperado: 150-250 MB${NC}"
        echo ""
    else
        echo -e "${GREEN}Tamano del paquete .deb valido (${DEB_SIZE} MB)${NC}"
        echo ""
    fi
    
    echo -e "${CYAN}INSTRUCCIONES DE INSTALACION:${NC}"
    echo -e "${WHITE}   1. Instalar con dpkg:${NC}"
    echo -e "${YELLOW}      sudo dpkg -i $DEB_NAME${NC}"
    echo -e "${WHITE}   2. Si hay dependencias faltantes:${NC}"
    echo -e "${YELLOW}      sudo apt-get install -f${NC}"
    echo -e "${WHITE}   3. O instalar con apt directamente:${NC}"
    echo -e "${YELLOW}      sudo apt install ./$DEB_NAME${NC}"
    echo ""
    
    echo -e "${CYAN}REQUISITOS DEL SISTEMA:${NC}"
    echo -e "${WHITE}   - Python 3.12+ (sudo apt install python3 python3-venv python3-pip)${NC}"
    echo -e "${WHITE}   - Ollama (para LLM local)${NC}"
    echo -e "${GRAY}   Alfred instalara las dependencias de Python automaticamente${NC}"
    echo ""
    
    echo -e "${CYAN}COMPATIBILIDAD:${NC}"
    echo -e "${WHITE}   - Debian 10+${NC}"
    echo -e "${WHITE}   - Ubuntu 18.04+${NC}"
    echo -e "${WHITE}   - Linux Mint 19+${NC}"
    echo -e "${WHITE}   - Otras distribuciones basadas en Debian${NC}"
    echo ""
    
    echo -e "${GREEN}======================================================${NC}"
    echo -e "${GREEN}     BUILD PARA DEBIAN COMPLETADO EXITOSAMENTE        ${NC}"
    echo -e "${GREEN}======================================================${NC}"
    echo ""
    
    # Preguntar si desea abrir la carpeta dist
    read -p "Deseas abrir la carpeta dist? (s/n): " open_dist
    if [ "$open_dist" = "s" ]; then
        if command -v xdg-open &> /dev/null; then
            xdg-open "$DIST_PATH"
        elif command -v nautilus &> /dev/null; then
            nautilus "$DIST_PATH"
        else
            echo -e "${GRAY}Carpeta: $DIST_PATH${NC}"
        fi
    fi
    
    exit 0
else
    echo -e "${YELLOW}Build completo pero no se encontro el archivo .deb${NC}"
    echo -e "${GRAY}   Verifica manualmente la carpeta dist/${NC}"
    echo ""
    
    # Mostrar contenido de dist
    if [ -d "$DIST_PATH" ]; then
        echo -e "${CYAN}Contenido de dist/:${NC}"
        ls -la "$DIST_PATH"
    fi
    
    exit 0
fi
