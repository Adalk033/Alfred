# 🚀 Quick Start - Alfred Backend

## ⚡ Inicio Rápido (5 minutos)

### 1️⃣ Configuración Inicial

```powershell
# Copia el archivo de configuración de ejemplo
Copy-Item .env.example .env

# Edita el archivo .env y configura tu ruta de documentos
notepad .env
```

**IMPORTANTE**: Edita `ALFRED_DOCS_PATH` con la ruta a tus documentos.

### 2️⃣ Instalar Dependencias

```powershell
# Opción A: Dependencias esenciales (recomendado para Windows)
pip install -r requirements_core.txt

# Opción B: Todas las dependencias (puede fallar en Windows por rutas largas)
pip install -r requirements.txt
```

**⚠️ Problema común en Windows:** Error de rutas largas
Si obtienes un error como `[WinError 206] The filename or extension is too long`, consulta: **`TROUBLESHOOTING_WINDOWS_PATH.md`**

### 3️⃣ Verificar Ollama

```powershell
# Verifica que Ollama esté ejecutándose
ollama list

# Si no tienes los modelos, descárgalos
ollama pull gemma2:9b
ollama pull nomic-embed-text:v1.5
```

### 4️⃣ Iniciar el Servidor

```powershell
# Opción A: Con el script (recomendado)
.\start_alfred_server.ps1

# Opción B: Directamente
python alfred_backend.py
```

### 5️⃣ Probar que Funciona

Abre tu navegador en: **http://localhost:8000/docs**

O ejecuta el script de pruebas:
```powershell
python test_backend.py
```

---

## 📱 Uso desde C#

### Agregar el Cliente

1. Copia `AlfredClient.cs` a tu proyecto C#
2. Agrega el paquete NuGet: `System.Net.Http.Json`

### Código Mínimo

```csharp
using AlfredApiClient;

var client = new AlfredClient("http://localhost:8000");
var response = await client.QueryAsync("¿Cuál es mi RFC?");
Console.WriteLine(response.Answer);
```

---

## 🔧 Comandos Útiles

### Servidor

```powershell
# Iniciar servidor (desarrollo con auto-reload)
$env:ALFRED_RELOAD='true'
python alfred_backend.py

# Iniciar servidor (producción)
python alfred_backend.py

# Ver documentación interactiva
Start-Process "http://localhost:8000/docs"
```

### Mantenimiento

```powershell
# Forzar recarga de documentos
$env:ALFRED_FORCE_RELOAD='true'
python alfred_backend.py

# Ver estadísticas
curl http://localhost:8000/stats | ConvertFrom-Json | Format-List

# Verificar salud
curl http://localhost:8000/health | ConvertFrom-Json
```

### Testing

```powershell
# Ejecutar suite de pruebas
python test_backend.py

# Prueba manual con curl
curl -X POST http://localhost:8000/query `
  -H "Content-Type: application/json" `
  -d '{\"question\": \"Hola\", \"use_history\": false}'
```

---

## 📚 Endpoints Esenciales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Info del servicio |
| GET | `/health` | Estado de salud |
| GET | `/stats` | Estadísticas |
| POST | `/query` | Consultar a Alfred |
| GET | `/history` | Ver historial |
| POST | `/history/search` | Buscar en historial |

---

## ❓ Problemas Comunes

### ❌ "Alfred Core no está inicializado"
```powershell
# Verifica Ollama
ollama list
ollama serve  # Si no está corriendo

# Verifica modelos
ollama pull gemma2:9b
```

### ❌ "No se encontró ALFRED_DOCS_PATH"
```powershell
# Edita tu .env
notepad .env

# Verifica que la ruta existe
Test-Path "C:\Users\TU_USUARIO\Documents"
```

### ❌ "Connection refused" desde C#
```powershell
# Verifica que el servidor esté corriendo
curl http://localhost:8000/health

# Verifica el firewall
netsh advfirewall firewall add rule name="Alfred" dir=in action=allow protocol=TCP localport=8000
```

### 🐌 Respuestas muy lentas
Edita `alfred_core.py` y reduce estos valores:
```python
search_kwargs={"k": 10, "fetch_k": 50}  # En lugar de 20 y 100
```

O usa un modelo más rápido en `.env`:
```env
ALFRED_MODEL=llama3.2:3b
```

---

## 📖 Documentación Completa

- **Backend**: Ver `README_BACKEND.md`
- **Deployment**: Ver `DEPLOYMENT.md`
- **API Docs**: http://localhost:8000/docs (cuando el servidor esté corriendo)

---

## 🎯 Checklist de Primera Ejecución

- [ ] Archivo `.env` configurado
- [ ] Ollama instalado y ejecutándose
- [ ] Modelos descargados (gemma2:9b, nomic-embed-text:v1.5)
- [ ] Dependencias instaladas (`pip install -r requirements.txt`)
- [ ] Ruta `ALFRED_DOCS_PATH` existe y tiene documentos
- [ ] Servidor iniciado correctamente
- [ ] Pruebas pasadas (`python test_backend.py`)
- [ ] Swagger UI accesible (http://localhost:8000/docs)

---

## 💡 Próximos Pasos

1. ✅ Lee `README_BACKEND.md` para entender la arquitectura
2. ✅ Explora la API en http://localhost:8000/docs
3. ✅ Integra con tu aplicación C# usando `AlfredClient.cs`
4. ✅ Personaliza el prompt en `config.py`
5. ✅ Configura seguridad para producción (ver `DEPLOYMENT.md`)

---

**¡Listo! Alfred está funcionando como backend 🤖✨**

¿Necesitas ayuda? Consulta los archivos de documentación o revisa los logs del servidor.
