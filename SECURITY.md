# Security Policy

## 1. Ejecución local y privacidad de datos

**Alfred** fue diseñado para operar completamente **en el entorno local del usuario**.  
Esto significa que:
- Ningún dato, documento ni conversación es enviado a servidores externos.
- Todo el procesamiento de información, inferencia de IA y gestión de bases de datos ocurre dentro de `127.0.0.1`.
- El usuario mantiene control total sobre sus archivos y modelos.

### Componentes protegidos
- **Frontend:** Aplicación WinUI 3 empaquetada para Windows. No realiza conexiones de red salientes.
- **Backend:** Servidor REST en C++ nativo (`alfred.exe`) escuchando exclusivamente en `localhost:8000`. Sin dependencias de Python ni servicios externos.
- **Base de datos y almacenamiento:** Los archivos `.db` de conversaciones e historial se almacenan exclusivamente en `%APPDATA%\Alfred\` en la máquina del usuario.
- **Modelos:** Los archivos GGUF residen localmente. Alfred no descarga ni actualiza modelos de forma automática.

---

## 2. Cifrado y datos sensibles

- Los datos sensibles almacenados localmente están protegidos con **AES-256-GCM**.
- No se incluyen archivos `.env`, claves API ni credenciales en el repositorio público.
- Los archivos de configuración personal y las bases de datos están listados en `.gitignore` y **no se versionan**.
- La aplicación no solicita ni almacena contraseñas ni tokens externos.

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
