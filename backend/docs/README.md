# Alfred
Your personal AI assistant running 100% locally

## 🚀 Caracteristicas

- **Totalmente Local**: Todo se ejecuta en tu maquina, tus datos nunca salen
- **Gestion de Documentos desde UI**: Agrega/elimina rutas de documentos desde la interfaz grafica, sin editar archivos de configuracion
- **Indexacion Bajo Demanda**: Reindexar documentos cuando quieras con un solo clic
- **Aceleracion por GPU**: Detecta y usa automaticamente GPU NVIDIA/AMD/Apple Silicon para mayor velocidad 🚀
- **Optimizacion Inteligente**: Busca primero en respuestas previas verificadas para mayor velocidad ⚡
- **Extraccion Inteligente**: Encuentra automaticamente RFC, CURP, NSS y otros datos personales
- **Base de Datos Vectorial**: Usa ChromaDB para busquedas semanticas eficientes
- **Modelos Ollama**: Powered by Gemma2:9b y nomic-embed-text
- **Sistema de Historial**: Aprende de tus respuestas verificadas para optimizar consultas futuras

## 📋 Requisitos

- Python 3.8+
- Ollama instalado con los modelos:
  - `gemma2:9b`
  - `nomic-embed-text:v1.5`
- (Opcional) GPU NVIDIA/AMD para mejor rendimiento

## 🔧 Configuracion

1. Instala las dependencias:
```bash
pip install -r requirements.txt
```

2. **Verificar GPU** (opcional pero recomendado):
```bash
python test_gpu.py
```

3. Crea un archivo `.env` con:
```env
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000
ALFRED_FORCE_RELOAD=false

# YA NO ES NECESARIO (sistema legacy deprecado):
# ALFRED_DOCS_PATH=C:\Users\TU_USUARIO\Documents
```

4. Ejecuta la aplicacion Electron:
```powershell
cd Alfred
.\start.ps1
```

5. **Gestiona tus documentos desde la UI**:
   - Ve a la seccion "Gestion de Documentos"
   - Haz clic en "Examinar" para agregar rutas
   - Haz clic en "Reindexar Documentos" para indexar

📚 **Ver guia completa**: [DOCUMENT_MANAGEMENT_MIGRATION.md](DOCUMENT_MANAGEMENT_MIGRATION.md)

## 🎮 GPU Support

Alfred detecta y usa automaticamente tu GPU para acelerar el procesamiento. Ver [GPU_SETUP.md](GPU_SETUP.md) para:
- Configuración de GPU NVIDIA/AMD/Apple Silicon
- Solución de problemas
- Optimizaciones de rendimiento

## 💡 Comandos Especiales

- `test` - Prueba directa de búsqueda en la base de datos
- `stats` - Muestra estadísticas de la base de datos y Q&A guardadas
- `history` - Ver las últimas 10 preguntas/respuestas guardadas
- `search` - Buscar en el historial con scoring inteligente de similitud
- `gpu` - Ver estado de GPU y uso de memoria
- `salir` o `exit` - Termina el programa

## ⚡ Optimización de Respuestas

Alfred ahora implementa un **sistema de 2 pasos** para responder más rápido:

1. **🔍 Paso 1 - Búsqueda en Historial** (instantáneo)
   - Analiza preguntas similares que ya hiciste antes
   - Si encuentra una coincidencia con +60% de similitud, te la muestra al instante
   - Puedes aceptarla o forzar una búsqueda completa

2. **📚 Paso 2 - Búsqueda Completa** (si es necesario)
   - Busca en todos tus documentos con ChromaDB
   - Procesa con el modelo de lenguaje
   - Respuesta detallada y contextual

**Beneficios:**
- ⚡ Respuestas instantáneas para preguntas repetidas
- 🎯 Mayor precisión usando respuestas ya verificadas
- 💚 Ahorro de recursos computacionales

📖 **Ver guía completa:** [OPTIMIZATION_GUIDE.md](OPTIMIZATION_GUIDE.md)

## 💾 Sistema de Historial Q&A

Alfred puede guardar preguntas y respuestas que tú verificas como correctas:

```bash
Tú: ¿Cuál es mi RFC?
🤖 Alfred: Tu RFC es: ABCD123456ABC

💾 ¿Esta respuesta es correcta? (s/n/Enter=no): s
✅ Respuesta guardada en el historial!
```

**Ventajas:**
- 📝 Crea una base de conocimiento personal verificada
- 🔍 Búsqueda rápida sin consultar documentos
- 📊 Trazabilidad con timestamps y fuentes
- 💾 Archivo JSON exportable

Ver [QA_HISTORY_GUIDE.md](QA_HISTORY_GUIDE.md) para más detalles.

## 🔍 Extracción Automática

Alfred detecta automáticamente:
- **RFC**: Formato estándar mexicano
- **CURP**: Clave Única de Registro de Población
- **NSS**: Número de Seguridad Social

## 🐛 Solución de Problemas

### No encuentra información

1. Verifica que `ALFRED_DOCS_PATH` apunte a la carpeta correcta
2. Recarga la base de datos:
```powershell
$env:ALFRED_FORCE_RELOAD='true'; python alfred.py
```

### Base de datos vacía

Verifica que los documentos sean legibles y estén en formatos compatibles (.pdf, .txt, .docx, etc.)

### Ver fragmentos recuperados

Activa el modo debug:
```powershell
$env:ALFRED_DEBUG='true'; python alfred.py
```

## 📝 Mejoras Recientes

- ✅ Chunks más grandes (3000 caracteres) para capturar contexto completo
- ✅ Mayor overlap (600 caracteres) para no perder información
- ✅ Extracción automática con Regex para RFC/CURP/NSS
- ✅ Recuperación de 15 documentos (antes 4)
- ✅ Búsqueda en 50 documentos antes de filtrar
- ✅ Respuesta directa para datos personales sin pasar por el LLM
- ✅ **Sistema de historial Q&A con verificación manual**
- ✅ **Comandos `history` y `search` para consultar respuestas guardadas**

## 📂 Archivos Generados

- `chroma_db/` - Base de datos vectorial (ChromaDB)
- `alfred_qa_history.json` - Historial de preguntas/respuestas verificadas
- `.notReadable` - Lista de archivos que no se pudieron procesar

⚠️ **Importante**: Agrega `alfred_qa_history.json` a tu `.gitignore` ya que contiene información personal sensible.

