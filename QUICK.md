# 🎉 Inicio Rápido - Alfred Electron

## ✅ Tu aplicación Electron está lista

Has obtenido una **aplicación de escritorio moderna** con interfaz gráfica para Alfred.

---

## 🚀 Cómo ejecutar (2 pasos)

### Paso 1: Instalar Node.js (si no lo tienes)

Descarga e instala desde: https://nodejs.org/
- Elige la versión **LTS** (recomendada)
- Ejecuta el instalador
- Acepta las opciones por defecto

### Paso 2: Ejecutar la aplicación

```powershell
cd f:\Projects\AlfredElectron
.\start.ps1
```

Eso es todo! El script se encarga de:
- ✅ Verificar Node.js
- ✅ Instalar dependencias automáticamente
- ✅ Verificar servidor de Alfred
- ✅ Iniciar la aplicación

---

## 💻 Alternativa: Comandos manuales

```powershell
# Solo la primera vez
cd f:\Projects\AlfredElectron
npm install

# Cada vez que quieras ejecutar
npm start
```

---

## 🎨 Características de la app

### Interfaz moderna
- ✨ Diseño oscuro elegante con gradientes
- 💬 Chat estilo mensajería
- 🤖 Avatares y burbujas de chat
- ⚡ Animaciones suaves

### Funcionalidades
- 📝 Escribe y envía mensajes
- 🔄 Efecto de escritura en respuestas
- 📚 Ver historial de conversaciones
- 📊 Ver estadísticas del sistema
- ⚙️ Configuración personalizable
- 📄 Ver fuentes de información

### Información contextual
- **Del historial**: Indica si usó una respuesta previa
- **Fragmentos**: Cuántos documentos analizó
- **Fuentes**: Qué archivos utilizó
- **Estado**: Conexión en tiempo real

---

## 📸 Cómo se ve

```
╔══════════════════════════════════════════════════════╗
║ 🤖 Alfred          🟢 Conectado    📊 📚 ⚙️          ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║                      🤖                              ║
║                ¡Hola! Soy Alfred                     ║
║           Tu asistente personal inteligente          ║
║                                                      ║
║     Pregúntame cualquier cosa sobre tus documentos  ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  👤  ¿Cuál es mi RFC?                                ║
║                                                      ║
║  🤖  Tu RFC es: XXXXXXXXXXX                        ║
║      [📚 Del historial] [🔍 2 fragmentos]            ║
║      📄 Fuentes:                                     ║
║         • Acta.pdf          ║
║         • cedula.pdf                                 ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  [Escribe tu mensaje aquí...]                  [▶]  ║
╚══════════════════════════════════════════════════════╝
```

---

## 🎯 Uso básico

### 1. Enviar mensajes
- Escribe en el campo de texto
- Presiona `Enter` o haz clic en ▶
- Alfred responderá con efecto de escritura

### 2. Ver historial (icono 🕐)
- Haz clic en el icono de reloj
- Se abre panel lateral
- Haz clic en cualquier conversación

### 3. Ver estadísticas (icono 📊)
- Haz clic en el icono de estadísticas
- Ver documentos indexados
- Ver consultas guardadas
- Ver modelo de IA usado

### 4. Configuración (icono ⚙️)
- Cambiar URL del servidor
- Activar/desactivar guardado
- Preferencias de búsqueda

---

## 🔧 Requisitos del sistema

- **Windows** 10/11 (o Mac/Linux)
- **Node.js** 22 o superior
- **RAM** 4GB mínimo
- **Disco** 200MB libres
- **Servidor Alfred** corriendo en http://localhost:8000

---

## ❓ Solución de problemas

### ⚠️ "Node.js no está instalado"
**Solución:** Descarga desde https://nodejs.org/

### ⚠️ "No se puede conectar con Alfred"
**Solución:** Inicia el servidor:
```powershell
cd ..\Alfred
.\start_alfred_server.ps1
```

### ⚠️ "Error al instalar dependencias"
**Solución:** Limpia e intenta de nuevo:
```powershell
Remove-Item node_modules -Recurse -Force
npm install
```

---

## 📂 Archivos principales

```
AlfredElectron/
├── start.ps1          ← Ejecuta esto para iniciar
├── package.json       ← Configuración del proyecto
├── main.js            ← Proceso principal Electron
├── renderer.js        ← Lógica de la interfaz
├── index.html         ← Estructura de la app
├── styles.css         ← Diseño visual
└── README.md          ← Documentación completa
```

---

## 🎨 Personalización rápida

### Cambiar color principal
Edita `styles.css`, línea 4:
```css
--primary-color: #4a9eff;  /* Cambia este color */
```

### Cambiar velocidad de escritura
Edita `renderer.js`, línea 232:
```javascript
const speed = 20;  // Menor = más rápido
```

---

## 📚 Ejemplos de uso

```
Pregunta: ¿Cuál es mi RFC?
Respuesta: Tu RFC es: XXXXXXXXX

Pregunta: ¿Cuándo nací?
Respuesta: Naciste el 1 de enero de 1910

Pregunta: ¿Qué documentos tengo?
Respuesta: Tienes 5 documentos disponibles...

Pregunta: Resumen de mi acta de nacimiento
Respuesta: Tu acta de nacimiento indica...
```

---

## 🚀 Próximos pasos

1. ✅ **Ejecuta** `.\start.ps1`
2. ✅ **Escribe** tu primera pregunta
3. ✅ **Explora** el historial y estadísticas
4. ✅ **Personaliza** colores y preferencias
5. ✅ **Disfruta** de tu asistente personal

---

## 🎁 Ventajas de Electron

- ✅ Ventana nativa de escritorio
- ✅ Icono en la barra de tareas
- ✅ Atajos de teclado del sistema
- ✅ No necesita navegador
- ✅ Puede ejecutarse en segundo plano
- ✅ Multiplataforma (Windows/Mac/Linux)

---

## 💡 Tips

- **Atajo Enter**: Enviar mensaje rápido
- **Shift + Enter**: Nueva línea en el mensaje
- **Panel lateral**: Cierra haciendo clic en la X
- **Historial**: Haz clic en una conversación para cargarla
- **DevTools**: Ctrl + Shift + I para abrir consola

---

## 📖 Documentación completa

Ver `README.md` para:
- Documentación detallada
- Guía de desarrollo
- Compilación para distribución
- Características avanzadas

---

¡Tu aplicación Electron de Alfred está lista! 🎊

Ejecuta `.\start.ps1` y comienza a usar tu asistente personal con una interfaz moderna. 🚀
