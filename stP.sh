#!/bin/bash

# ============================================================================
# Alfred - Script de Arranque Universal (Linux/macOS)
# ============================================================================
# Este script verifica, instala dependencias e inicia Alfred automáticamente

set -e

# === Colores y formato ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

function print_header {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

function print_step {
    echo -e "${YELLOW}▶ $1${NC}"
}

function print_success {
    echo -e "${GREEN}✅ $1${NC}"
}

function print_warning {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

function print_error {
    echo -e "${RED}❌ $1${NC}"
}

function print_info {
    echo -e "${GRAY}   $1${NC}"
}

# === Variables globales ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_ROOT/backend"
VENV_DIR="$BACKEND_DIR/venv"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_TEMPLATE="$PROJECT_ROOT/.env.template"
GPU_CHECK_SCRIPT="$BACKEND_DIR/gpu/gpu_check.py"
GPU_INFO_FILE="$BACKEND_DIR/gpu/gpu_info.json"

# === Banner ===
clear
echo ""
echo -e "${CYAN}   █████╗ ██╗     ███████╗██████╗ ███████╗██████╗ ${NC}"
echo -e "${CYAN}  ██╔══██╗██║     ██╔════╝██╔══██╗██╔════╝██╔══██╗${NC}"
echo -e "${CYAN}  ███████║██║     █████╗  ██████╔╝█████╗  ██║  ██║${NC}"
echo -e "${CYAN}  ██╔══██║██║     ██╔══╝  ██╔══██╗██╔══╝  ██║  ██║${NC}"
echo -e "${CYAN}  ██║  ██║███████╗██║     ██║  ██║███████╗██████╔╝${NC}"
echo -e "${CYAN}  ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═════╝ ${NC}"
echo ""
echo "  Asistente Personal Inteligente - Local & Privado"
echo ""

# === Función: Verificar Python ===
function test_python {
    print_step "Verificando Python..."
    
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        print_error "Python no está instalado"
        print_info "Instala Python 3.8 o superior:"
        print_info "  Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
        print_info "  macOS: brew install python3"
        return 1
    fi
    
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
    print_success "Python instalado: $PYTHON_VERSION"
    return 0
}

# === Función: Crear entorno virtual ===
function initialize_venv {
    print_step "Verificando entorno virtual..."
    
    if [ -d "$VENV_DIR" ]; then
        print_success "Entorno virtual existente encontrado"
        return 0
    fi
    
    print_warning "Creando entorno virtual..."
    print_info "Ubicación: $VENV_DIR"
    
    $PYTHON_CMD -m venv "$VENV_DIR" || {
        print_error "Error al crear entorno virtual"
        return 1
    }
    
    print_success "Entorno virtual creado exitosamente"
    return 0
}

# === Función: Instalar dependencias ===
function install_dependencies {
    print_step "Verificando dependencias de Python..."
    
    ACTIVATE_SCRIPT="$VENV_DIR/bin/activate"
    REQUIREMENTS_FILE="$BACKEND_DIR/requirements.txt"
    
    if [ ! -f "$REQUIREMENTS_FILE" ]; then
        print_error "Archivo requirements.txt no encontrado"
        return 1
    fi
    
    print_info "Activando entorno virtual..."
    source "$ACTIVATE_SCRIPT"
    
    print_info "Instalando dependencias..."
    print_info "Esto puede tardar varios minutos en la primera ejecución..."
    
    $PYTHON_CMD -m pip install --upgrade pip
    pip install -r "$REQUIREMENTS_FILE" || {
        print_error "Error al instalar dependencias"
        return 1
    }
    
    print_success "Dependencias instaladas correctamente"
    return 0
}

# === Función: Verificar Ollama ===
function test_ollama {
    print_step "Verificando Ollama..."
    
    if ! command -v ollama &> /dev/null; then
        print_error "Ollama no está instalado"
        print_info "Descarga desde: https://ollama.ai/"
        print_info "  Linux: curl -fsSL https://ollama.ai/install.sh | sh"
        print_info "  macOS: brew install ollama"
        return 1
    fi
    
    OLLAMA_VERSION=$(ollama version 2>&1 | head -n1)
    print_success "Ollama instalado: $OLLAMA_VERSION"
    
    # Verificar si el servicio está corriendo
    if ollama list &> /dev/null; then
        print_success "Servicio Ollama activo"
        return 0
    fi
    
    print_warning "Servicio Ollama no está corriendo"
    print_info "Iniciando Ollama en segundo plano..."
    
    # Iniciar Ollama según el sistema
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        ollama serve &> /dev/null &
    else
        # Linux
        systemctl --user start ollama 2>/dev/null || ollama serve &> /dev/null &
    fi
    
    sleep 3
    return 0
}

# === Función: Verificar modelos de Ollama ===
function test_ollama_models {
    print_step "Verificando modelos de Ollama..."
    
    REQUIRED_MODELS=("gemma2:9b" "nomic-embed-text:v1.5")
    INSTALLED_MODELS=$(ollama list 2>&1)
    
    for model in "${REQUIRED_MODELS[@]}"; do
        if echo "$INSTALLED_MODELS" | grep -q "$model"; then
            print_success "Modelo $model encontrado"
        else
            print_warning "Modelo $model no encontrado"
            print_info "Descargando $model..."
            print_info "Esto puede tardar varios minutos según tu conexión"
            ollama pull "$model" || {
                print_error "Error al descargar modelo $model"
                return 1
            }
        fi
    done
    
    return 0
}

# === Función: Detectar GPU ===
function test_gpu {
    print_step "Detectando GPU..."
    
    if [ -f "$GPU_CHECK_SCRIPT" ]; then
        source "$VENV_DIR/bin/activate"
        
        $PYTHON_CMD "$GPU_CHECK_SCRIPT" || {
            print_warning "Error al detectar GPU"
            return 0  # No es crítico
        }
        
        if [ -f "$GPU_INFO_FILE" ]; then
            GPU_TYPE=$(grep -o '"gpu_type": "[^"]*"' "$GPU_INFO_FILE" | cut -d'"' -f4)
            GPU_AVAILABLE=$(grep -o '"gpu_available": [^,]*' "$GPU_INFO_FILE" | cut -d':' -f2 | tr -d ' ')
            
            if [ "$GPU_AVAILABLE" = "true" ]; then
                print_success "GPU detectada: $GPU_TYPE"
            else
                print_warning "No se detectó GPU compatible, usando CPU"
            fi
        fi
    else
        print_warning "Script de detección GPU no encontrado"
    fi
    
    return 0
}

# === Función: Configurar .env ===
function initialize_environment {
    print_step "Verificando archivo .env..."
    
    if [ -f "$ENV_FILE" ]; then
        print_success "Archivo .env encontrado"
        return 0
    fi
    
    if [ ! -f "$ENV_TEMPLATE" ]; then
        print_error "Plantilla .env.template no encontrada"
        return 1
    fi
    
    print_warning "Creando archivo .env desde plantilla..."
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    
    # Solicitar ruta de documentos
    echo ""
    echo -e "${YELLOW}📁 Configuración de documentos:${NC}"
    echo -e "${GRAY}   Alfred necesita acceso a tus documentos para responder preguntas.${NC}"
    echo -e "${GRAY}   Ingresa la ruta completa a tu carpeta de documentos:${NC}"
    
    read -p "   Ruta: " DOCS_PATH
    
    if [ -n "$DOCS_PATH" ] && [ -d "$DOCS_PATH" ]; then
        # Reemplazar en .env
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|ALFRED_DOCS_PATH=|ALFRED_DOCS_PATH=$DOCS_PATH|" "$ENV_FILE"
        else
            # Linux
            sed -i "s|ALFRED_DOCS_PATH=|ALFRED_DOCS_PATH=$DOCS_PATH|" "$ENV_FILE"
        fi
        print_success "Ruta configurada: $DOCS_PATH"
    else
        print_warning "Ruta no válida, deberás configurarla manualmente en .env"
    fi
    
    print_success "Archivo .env creado"
    return 0
}

# === Función: Verificar Node.js ===
function test_nodejs {
    print_step "Verificando Node.js..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js no está instalado"
        print_info "Instala Node.js:"
        print_info "  Ubuntu/Debian: sudo apt install nodejs npm"
        print_info "  macOS: brew install node"
        print_info "Descarga desde: https://nodejs.org/"
        return 1
    fi
    
    NODE_VERSION=$(node --version 2>&1)
    print_success "Node.js instalado: $NODE_VERSION"
    return 0
}

# === Función: Instalar dependencias Node.js ===
function install_node_dependencies {
    print_step "Verificando dependencias de Node.js..."
    
    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        print_success "Dependencias Node.js ya instaladas"
        return 0
    fi
    
    print_info "Instalando dependencias..."
    print_info "Esto puede tardar unos minutos..."
    
    cd "$PROJECT_ROOT"
    npm install || {
        print_error "Error al instalar dependencias"
        return 1
    }
    
    print_success "Dependencias instaladas correctamente"
    return 0
}

# === Función: Verificar backend en ejecución ===
function test_backend_running {
    curl -s -f http://127.0.0.1:8000/health &> /dev/null
    return $?
}

# === Función: Iniciar aplicación ===
function start_application {
    print_header "INICIANDO ALFRED"
    
    # Verificar si el backend ya está corriendo
    if test_backend_running; then
        print_success "Backend ya está en ejecución"
    else
        print_info "El backend será iniciado por Electron automáticamente"
    fi
    
    print_step "Iniciando aplicación Electron..."
    print_info "Abriendo Alfred..."
    
    cd "$PROJECT_ROOT"
    npm start
}

# ============================================================================
# SCRIPT PRINCIPAL
# ============================================================================

print_header "VERIFICACIÓN DE REQUISITOS"

# 1. Verificar Python
test_python || exit 1

# 2. Crear/verificar entorno virtual
initialize_venv || exit 1

# 3. Instalar dependencias Python
install_dependencies || exit 1

# 4. Verificar Ollama
test_ollama || exit 1

# 5. Verificar modelos de Ollama
test_ollama_models

# 6. Detectar GPU
test_gpu

# 7. Configurar .env
initialize_environment || exit 1

print_header "VERIFICACIÓN DE FRONTEND"

# 8. Verificar Node.js
test_nodejs || exit 1

# 9. Instalar dependencias Node.js
install_node_dependencies || exit 1

# 10. Iniciar aplicación
start_application

echo ""
print_success "Alfred finalizado"
echo ""
