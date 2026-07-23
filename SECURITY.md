# Security Policy

## 1. Ejecución local y privacidad de datos

**Alfred** está diseñado para ejecutar localmente la inferencia, el historial y el procesamiento de documentos. Los prompts, las respuestas y los archivos adjuntos no se envían a un proveedor de IA remoto.

### Componentes protegidos

- **Frontend:** aplicación WinUI 3 para Windows. Solo se conecta a `huggingface.co` cuando el usuario busca o descarga un modelo desde la pantalla **Modelos**.
- **Backend:** servidor REST C++ nativo (`alfred.exe`) que la UI inicia en `127.0.0.1:8000`. No requiere Python, Ollama ni MCP.
- **Base de datos:** conversaciones, memoria y configuración se guardan en `%APPDATA%\Alfred\db\alfred.db`.
- **Modelos:** los GGUF se guardan en `%APPDATA%\Alfred\models\`. No se descargan ni actualizan sin una acción explícita del usuario.
- **Preferencias y logs de UI:** se guardan en `%LOCALAPPDATA%\Alfred\`.

La búsqueda o descarga de modelos sí produce una conexión directa con Hugging Face y expone a ese servicio la consulta de búsqueda y los metadatos normales de una conexión de red. La inferencia no usa esa conexión.

### Autenticación de la API local

La interfaz genera un **token de sesión aleatorio (32 bytes)** en cada
arranque y lo pasa al backend mediante `--auth-token`. Todas las peticiones
lo incluyen en la cabecera `X-Alfred-Token`; el backend responde `401` si no
coincide (solo `/health` queda exento). Además, se eliminó el `CORS *`, de
modo que una página web abierta en el navegador **no puede** invocar la API
local (mitigación de CSRF / DNS-rebinding).

---

## 2. Cifrado y datos sensibles

- El cifrado AES-256-GCM solo está disponible cuando el backend se compila con OpenSSL.
- Está **deshabilitado por defecto** y su estado se persiste cuando el usuario lo cambia desde Configuración.
- Al iniciar por primera vez, el backend genera una clave aleatoria de 32 bytes y la guarda localmente en `%APPDATA%\Alfred\data\secret.key`. La API también admite una passphrase opcional; en ese caso deriva una clave mediante PBKDF2-HMAC-SHA256 (100 000 iteraciones y salt aleatoria) y persiste la clave derivada, no la passphrase.
- Al activarlo, se cifran las **escrituras nuevas** de contenido de conversaciones, valores de memoria y determinados campos de perfil. No cifra retroactivamente filas existentes, modelos GGUF, rutas/metadatos, preferencias de UI ni logs.
- Desactivar el cifrado hace que las escrituras posteriores vuelvan a guardarse en claro; las filas cifradas previamente siguen leyéndose con la clave local.
- La clave está en el mismo perfil de Windows que los datos. Esto protege el contenido en reposo frente a una inspección casual de la base, pero **no sustituye** BitLocker, permisos de cuenta ni el bloqueo del dispositivo. Quien obtenga la base y `secret.key` puede descifrar los valores protegidos.
- Si se pierde `secret.key`, Alfred no puede recuperar las filas cifradas. Las copias de seguridad deben conservar la base y la clave juntas, con controles de acceso adecuados.
- No se incluyen archivos `.env`, claves API ni credenciales en el repositorio público.

### Datos de diagnóstico

- El backend guarda logs locales en `%APPDATA%\Alfred\logs\`. Para diagnóstico, una entrada de consulta puede incluir los primeros 80 caracteres del prompt, además de identificadores de conversación/modelo y mensajes de error.
- Los fallos no controlados de la UI se registran en `%LOCALAPPDATA%\Alfred\logs\ui-crash.log` con el tipo de excepción, mensaje y stack trace.
- Estos logs no se transmiten automáticamente. Revísalos o elimínalos antes de compartirlos en un issue.

---

## 3. Dependencias y ejecución

- El backend es un ejecutable C++ compilado con MSVC. No requiere Python, Ollama ni MCP.
- Las dependencias nativas se fijan y obtienen durante la compilación mediante **CMake FetchContent**; sus versiones pueden auditarse en `CMakeLists.txt`.
- Los paquetes oficiales incluyen Windows App SDK, el runtime de Visual C++, PDFium y, en la variante GPU, las bibliotecas CUDA necesarias. La variante GPU todavía requiere un driver NVIDIA compatible.
- No se descarga ni ejecuta código remoto durante el uso. Los archivos GGUF solicitados por el usuario sí se descargan como datos desde Hugging Face.

---

## 4. Reporte de vulnerabilidades

Si descubres una posible vulnerabilidad de seguridad o un comportamiento inesperado que comprometa la privacidad o integridad local, repórtalo de forma responsable:

- Usa un **reporte privado de seguridad de GitHub** si está habilitado para el repositorio, o contacta privadamente al mantenedor mediante la información de su perfil.
- Para errores no sensibles, abre un *issue* marcado como **[security]**.
- No publiques pruebas de concepto, datos personales, tokens, claves o contenido de logs sin redactar antes de que el fallo sea revisado.

**Compromiso:** Las vulnerabilidades válidas serán analizadas, corregidas y documentadas en el *changelog* del proyecto.

---

## 5. Recomendaciones al usuario

- No compartas tu carpeta de instalación ni los archivos de base de datos o modelos locales.
- Descarga *Alfred* únicamente desde las [releases oficiales](https://github.com/Adalk033/Alfred/releases) del repositorio.
- Mantén actualizado tu sistema operativo para evitar exploits conocidos a nivel de OS.

---

**Última actualización:** 23 de julio de 2026

**Mantenedor:** Cristhian — Desarrollador Full-Stack
