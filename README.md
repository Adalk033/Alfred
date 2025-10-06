# 🚀 Alfred Electron - Aplicación de Escritorio

Aplicación de escritorio moderna para interactuar con Alfred usando Electron.

![Alfred Electron](https://img.shields.io/badge/Electron-v28.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Características

- 🎨 **Interfaz moderna y elegante** - Diseño oscuro con gradientes
- 💬 **Chat en tiempo real** - Conversación fluida con Alfred
- ⚡ **Efecto de escritura** - Respuestas animadas letra por letra
- 📚 **Historial de conversaciones** - Accede a consultas anteriores
- 📊 **Estadísticas del sistema** - Información en tiempo real
- ⚙️ **Configuración personalizable** - Ajusta la app a tu gusto
- 🔔 **Indicadores visuales** - Estado de conexión y actividad
- 📄 **Información de fuentes** - Ve qué documentos se usaron
- 💾 **Guardado automático** - Tus conversaciones se guardan automáticamente
- 🖥️ **Multiplataforma** - Windows, Mac y Linux
- 🚀 **Inicio automático del backend** - ¡Ya no necesitas abrir terminal! (NUEVO)
- 🔄 **Reinicio del servidor** - Reinicia el backend con un clic (NUEVO)

## 📋 Requisitos previos

1. **Node.js 18 o superior** - [Descargar](https://nodejs.org/)
2. **npm** (incluido con Node.js)
3. **Python** (para el backend de Alfred)
4. ~~**Servidor de Alfred** ejecutándose~~ - ¡Ya no necesitas iniciarlo manualmente! 🎉

## 🚀 Inicio rápido

### Opción 1: Script automático (Recomendado)

```powershell
cd f:\Projects\AlfredElectron
.\start.ps1
```

Este script:
- ✅ Verifica que Node.js esté instalado
- ✅ Instala las dependencias automáticamente
- ✅ Verifica el servidor de Alfred
- ✅ Inicia la aplicación

### Opción 2: Manual

```powershell
# 1. Instalar dependencias (solo la primera vez)
npm install

# 2. Iniciar la aplicación
npm start
```

> **🎉 NUEVO**: El backend de Alfred ahora se inicia automáticamente. ¡Ya no necesitas abrir una terminal separada!
> 
> Si prefieres iniciarlo manualmente, simplemente ejecútalo antes de abrir AlfredElectron y la app lo detectará.
> 
> **Documentación:** [QUICK_START_AUTO_BACKEND.md](QUICK_START_AUTO_BACKEND.md)

## 📸 Capturas de pantalla

### Pantalla principal
```
┌────────────────────────────────────────────────────────┐
│ 🤖 Alfred                    🟢 Conectado    ⚙️ 📊 📁  │
├────────────────────────────────────────────────────────┤
│                                                        │
│                   🤖                                   │
│              ¡Hola! Soy Alfred                         │
│         Tu asistente personal inteligente              │
│                                                        │
│    Pregúntame cualquier cosa sobre tus documentos     │
│                                                        │
├────────────────────────────────────────────────────────┤
│  👤  ¿Cuál es mi RFC?                                  │
│                                                        │
│  🤖  Tu RFC es: XXXXXXXXXX                          │
│      [📚 Del historial (85%)] [🔍 2 fragmentos]        │
│      📄 Fuentes:                                       │
│         • Acta.pdf            │
│         • cedula.pdf                                   │
│                                                        │
├────────────────────────────────────────────────────────┤
│  [Escribe tu mensaje aquí...]                    [▶]  │
└────────────────────────────────────────────────────────┘
```

## 🎨 Características de la interfaz

### 1. Chat principal
- Área de mensajes con scroll suave
- Burbujas de chat diferenciadas (usuario/asistente)
- Avatares personalizados
- Timestamps automáticos

### 2. Efectos visuales
- Efecto de escritura para respuestas de Alfred
- Indicador "escribiendo..." mientras procesa
- Animaciones suaves de entrada
- Gradientes modernos

### 3. Información contextual
- Badge "Del historial" cuando usa conversaciones previas
- Contador de fragmentos analizados
- Lista de archivos fuente utilizados
- Datos personales extraídos

### 4. Panel lateral
- **Historial**: Ver las últimas 20 conversaciones
- **Estadísticas**: Métricas del sistema en tiempo real
- Deslizamiento suave desde el lateral

### 5. Configuración
- URL del servidor personalizable
- Opciones de guardado automático
- Búsqueda en historial
- Preferencias de notificaciones

## 📁 Estructura del proyecto

```
AlfredElectron/
├── main.js                 # Proceso principal de Electron
├── preload.js              # Script de precarga (seguridad)
├── renderer.js             # Lógica de la interfaz
├── index.html              # Estructura HTML
├── styles.css              # Estilos CSS modernos
├── package.json            # Configuración del proyecto
├── start.ps1               # Script de inicio (Windows)
├── README.md               # Esta documentación
└── assets/                 # Recursos (iconos, etc.)
```

## 🎯 Uso de la aplicación

### Enviar mensajes

1. Escribe tu pregunta en el campo de texto
2. Presiona `Enter` o haz clic en el botón ▶
3. Alfred procesará tu consulta y responderá

**Atajos de teclado:**
- `Enter` - Enviar mensaje
- `Shift + Enter` - Nueva línea

### Ver historial

1. Haz clic en el icono 🕐 en la barra superior
2. Se abrirá el panel lateral con el historial
3. Haz clic en cualquier conversación para verla en el chat

### Ver estadísticas

1. Haz clic en el icono 📊 en la barra superior
2. Verás información del sistema:
   - Usuario actual
   - Documentos indexados
   - Consultas guardadas
   - Modelo de IA utilizado
   - Rutas de archivos

### Reiniciar el servidor (NUEVO)

1. Haz clic en el icono 🔄 en la barra superior
2. El backend se reiniciará automáticamente
3. Verás notificaciones del progreso

**Útil cuando:**
- Pierdes conexión con el servidor
- El servidor deja de responder
- Has actualizado el código del backend

### Configuración

1. Haz clic en el icono ⚙️ en la barra superior
2. Ajusta las opciones:
   - URL del servidor
   - Guardado automático
   - Búsqueda en historial
   - Sonidos (próximamente)

## 🔧 Desarrollo

### Ejecutar en modo desarrollo

```powershell
npm run dev
```

Esto abrirá las DevTools automáticamente para depuración.

### Compilar para producción

```powershell
# Windows
npm run build:win

# Mac
npm run build:mac

# Linux
npm run build:linux

# Todas las plataformas
npm run build
```

Los ejecutables se generarán en la carpeta `dist/`.

## � Inicio Automático del Backend (NUEVO)

### ¿Cómo funciona?

AlfredElectron ahora puede gestionar automáticamente el backend de Alfred:

1. **Al iniciar**: Verifica si el backend está corriendo
2. **Si no está activo**: Lo inicia automáticamente
3. **Notificaciones**: Te muestra el progreso en tiempo real
4. **Al cerrar**: Detiene el backend limpiamente

### Características

✅ **Sin configuración manual** - Todo automático  
✅ **Notificaciones visuales** - Sabes qué está pasando  
✅ **Botón de reinicio** - Soluciona problemas con un clic  
✅ **Detección inteligente** - Detecta backends externos  
✅ **Logs integrados** - Ve los logs en DevTools  

### Uso básico

```powershell
# Solo necesitas esto:
npm start

# El backend se inicia automáticamente
# No necesitas otra terminal
```

### Verificar instalación

```powershell
# Ejecuta el script de diagnóstico:
.\test-auto-backend.ps1
```

### Documentación completa

- 📘 [Guía rápida](QUICK_START_AUTO_BACKEND.md)
- 📗 [Documentación completa](AUTO_BACKEND_START.md)
- 📙 [Resumen técnico](IMPLEMENTATION_SUMMARY.md)

### Solución de problemas

#### El backend no inicia
```powershell
# Verifica Python:
python --version

# Si falla, agrega Python al PATH
```

#### Ver logs del backend
1. Abre DevTools: `View > Toggle Developer Tools`
2. Ve a la pestaña `Console`
3. Busca mensajes con `[Backend]`

#### Reiniciar manualmente
- Haz clic en el botón 🔄 en la barra superior

## �🛠️ Personalización

### Cambiar colores

Edita las variables CSS en `styles.css`:

```css
:root {
    --primary-color: #4a9eff;      /* Color principal */
    --bg-primary: #1e1e1e;         /* Fondo principal */
    --bg-secondary: #2d2d2d;       /* Fondo secundario */
    --text-primary: #ffffff;       /* Texto principal */
    /* ... más variables ... */
}
```

### Modificar velocidad de escritura

En `renderer.js`, línea ~232:

```javascript
const speed = 20; // Cambiar este valor (ms por carácter)
// Menor = más rápido, Mayor = más lento
```

### Cambiar tamaño de ventana

En `main.js`, línea ~10:

```javascript
mainWindow = new BrowserWindow({
    width: 1200,    // Ancho
    height: 800,    // Alto
    minWidth: 800,  // Ancho mínimo
    minHeight: 600  // Alto mínimo
    // ...
});
```

## 🐛 Solución de problemas

### Error: "Node.js no está instalado"

**Solución:**
1. Descarga Node.js desde [nodejs.org](https://nodejs.org/)
2. Instala la versión LTS (recomendada)
3. Reinicia tu terminal
4. Verifica con `node --version`

### Error: "Cannot find module 'electron'"

**Solución:**
```powershell
npm install
```

### Error: "Cannot connect to Alfred server"

**Solución:**
1. Asegúrate de que el servidor esté corriendo:
```powershell
cd ..\Alfred
.\start_alfred_server.ps1
```
2. Verifica la URL en Configuración (⚙️)

### La aplicación no inicia

**Solución:**
```powershell
# Limpiar e reinstalar
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install
npm start
```

### Fuentes o estilos no se ven bien

**Solución:**
- Presiona `Ctrl + R` para recargar la aplicación
- O cierra y vuelve a abrir

## 📦 Dependencias

### Producción
- `electron` - Framework para aplicaciones de escritorio

### Desarrollo
- `electron-builder` - Para compilar ejecutables

## 🔐 Seguridad

La aplicación implementa:
- ✅ `contextIsolation` habilitado
- ✅ `nodeIntegration` deshabilitado
- ✅ Script `preload.js` para API segura
- ✅ Sin acceso directo al sistema desde el renderer

## 🚀 Próximas características

- [ ] Exportar conversaciones a PDF/TXT
- [ ] Búsqueda en el chat actual
- [ ] Temas claro/oscuro
- [ ] Notificaciones del sistema
- [ ] Atajos de teclado personalizables
- [ ] Soporte para voz (speech-to-text)
- [ ] Adjuntar archivos directamente
- [ ] Panel de documentos indexados

## 📝 Notas técnicas

- **Electron**: v28.0.0
- **Node.js**: v22+ requerido
- **Plataformas**: Windows, macOS, Linux
- **Tamaño**: ~150MB (incluye Chromium)

## 🤝 Contribuir

Si quieres mejorar la aplicación:

1. Haz un fork del proyecto
2. Crea una rama para tu característica
3. Haz commit de tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - Puedes usar, modificar y distribuir libremente

## 🔗 Enlaces útiles

- [Documentación de Electron](https://www.electronjs.org/docs)
- [Documentación de Alfred Backend](../Alfred/README_BACKEND.md)
- [Node.js](https://nodejs.org/)

---

## 📞 Soporte

Si tienes problemas o preguntas:
1. Revisa la sección de **Solución de problemas**
2. Verifica que el servidor de Alfred esté corriendo
3. Revisa la consola de DevTools (`Ctrl + Shift + I`)

---

¡Disfruta usando Alfred Electron! 🚀🤖
