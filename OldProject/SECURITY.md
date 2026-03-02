# Security Policy

## 1. Ejecución local y privacidad de datos

**Alfred** fue diseñado para operar completamente **en el entorno local del usuario**.  
Esto significa que:
- Ningún dato, documento ni conversación es enviado a servidores externos.
- Todo el procesamiento de información, inferencia de IA y gestión de bases de datos ocurre dentro de `127.0.0.1`.
- El usuario mantiene control total sobre sus archivos y modelos.

### Componentes protegidos
- **Frontend:** Empaquetado en `app.asar`, sin rutas de red externas.
- **Backend:** Ejecutado localmente mediante `python-portable`, sin dependencias de red saliente.
- **Base de datos y almacenamiento:** Los archivos `.db` y directorios `chroma_db/` se mantienen exclusivamente en la máquina del usuario.

---

## 2. Datos sensibles y configuración

- No se incluyen archivos `.env`, claves API ni credenciales en el repositorio público.  
- Los archivos de configuración personal (`.env.local`, `config.local.json`, bases de datos o historiales de conversación) están listados en `.gitignore` y **no se versionan**.
- La aplicación no solicita ni almacena contraseñas ni tokens externos.

---

## 3. Dependencias y ejecución

- El backend usa un entorno **Python Portable aislado**, de modo que no modifica ni depende del Python del sistema.
- Las dependencias se instalan de forma controlada durante el proceso de build y pueden auditarse desde `requirements.txt`.
- No se ejecutan procesos remotos ni descargas automáticas de código externo.

---

## 4. Reporte de vulnerabilidades

Si descubres una posible vulnerabilidad de seguridad o un comportamiento inesperado que comprometa la privacidad o integridad local, repórtalo de forma responsable:

- Envía un correo o abre un *issue* marcado como **[security]** en GitHub.  
- No publiques detalles técnicos del fallo de forma pública antes de que se haya revisado.

**Compromiso:** Las vulnerabilidades válidas serán analizadas, corregidas y documentadas en el *changelog* del proyecto.

---

## 5. Recomendaciones al usuario

- No compartas tu carpeta de instalación ni los archivos de configuración (`.env`, bases de datos, historiales, modelos locales`).
- Descarga *Alfred* únicamente desde fuentes oficiales del repositorio.
- Mantén actualizado tu entorno local y dependencias para evitar exploits conocidos.

---

**Última actualización:** noviembre de 2025  
**Mantenedor:** Cristhian — Desarrollador Full-Stack  
