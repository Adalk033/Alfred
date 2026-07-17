# Security Policy

## 1. Ejecución local y privacidad de datos

**Alfred** fue diseñado para operar completamente **en el entorno local del usuario**.  
Esto significa que:
- Ningún dato, documento ni conversación es enviado a servidores externos.
- Todo el procesamiento de información, inferencia de IA y gestión de bases de datos ocurre dentro de `127.0.0.1`.
- El usuario mantiene control total sobre sus archivos y modelos.

### Componentes protegidos
- **Frontend:** Aplicación WinUI 3 para Windows. No realiza conexiones de red salientes salvo la descarga de modelos que el usuario solicita explícitamente desde HuggingFace.
- **Backend:** Servidor REST en C++ nativo (`alfred.exe`) escuchando exclusivamente en `localhost:8000`. Sin dependencias de Python ni servicios externos.
- **Base de datos y almacenamiento:** Los archivos `.db` de conversaciones e historial se almacenan exclusivamente en `%APPDATA%\Alfred\` en la máquina del usuario.
- **Modelos:** Los archivos GGUF residen localmente. Alfred no descarga ni actualiza modelos de forma automática.

### Autenticación de la API local
La interfaz genera un **token de sesión aleatorio (32 bytes)** en cada
arranque y lo pasa al backend mediante `--auth-token`. Todas las peticiones
lo incluyen en la cabecera `X-Alfred-Token`; el backend responde `401` si no
coincide (solo `/health` queda exento). Además, se eliminó el `CORS *`, de
modo que una página web abierta en el navegador **no puede** invocar la API
local (mitigación de CSRF / DNS-rebinding).

---

## 2. Cifrado y datos sensibles

- Los datos sensibles almacenados localmente pueden protegerse con **AES-256-GCM**.
- La clave se deriva de la passphrase del usuario con **PBKDF2-HMAC-SHA256** (100 000 iteraciones, salt aleatoria) y se persiste de forma que el historial cifrado siga siendo legible tras reiniciar.
- El cifrado está **deshabilitado por defecto**; solo se activa explícitamente desde Configuración, y su estado se persiste.
- No se incluyen archivos `.env`, claves API ni credenciales en el repositorio público.
- Los archivos de configuración personal y las bases de datos están listados en `.gitignore` y **no se versionan**.

---

## 3. Dependencias y ejecución

- El backend es un ejecutable C++ compilado (MSVC). No requiere Python, Ollama ni ningún runtime externo.
- Las dependencias (llama.cpp, SQLiteCpp, cpp-httplib, PDFium, etc.) se integran en tiempo de compilación vía **CMake FetchContent** y pueden auditarse directamente desde `CMakeLists.txt`.
- No se ejecutan procesos remotos ni descargas automáticas de código externo en tiempo de ejecución.

---

## 4. Reporte de vulnerabilidades

Si descubres una posible vulnerabilidad de seguridad o un comportamiento inesperado que comprometa la privacidad o integridad local, repórtalo de forma responsable:

- Abre un *issue* marcado como **[security]** en GitHub, o contáctanos directamente por correo.
- No publiques detalles técnicos del fallo de forma pública antes de que haya sido revisado.

**Compromiso:** Las vulnerabilidades válidas serán analizadas, corregidas y documentadas en el *changelog* del proyecto.

---

## 5. Recomendaciones al usuario

- No compartas tu carpeta de instalación ni los archivos de base de datos o modelos locales.
- Descarga *Alfred* únicamente desde las [releases oficiales](https://github.com/Adalk033/Alfred/releases) del repositorio.
- Mantén actualizado tu sistema operativo para evitar exploits conocidos a nivel de OS.

---

**Última actualización:** abril de 2026  
**Mantenedor:** Cristhian — Desarrollador Full-Stack  
