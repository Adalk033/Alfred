# Alfred — Instrucciones para asistentes de codigo

- NO crear archivos .md ni scripts sin preguntar primero.
- NO usar iconos, emojis, tildes ni enies en el codigo.
- NO borrar codigo existente sin preguntar primero.

---

## Stack Tecnologico

- **Backend:** C++20, CMake 3.20+, llama.cpp (GGUF), cpp-httplib, SQLite3, spdlog, nlohmann/json
- **GPU:** CUDA nativo via ggml backend (NO Ollama, NO Python)
- **Frontend:** WinUI 3, .NET 9, C#, CommunityToolkit.Mvvm
- **Plataforma:** Windows 10.0.19041+ exclusivamente

## Convenciones

- Comentarios y logs en **espanol sin tildes ni enies** (compatibilidad ASCII)
- No crear archivos README ni documentacion adicional salvo que se pida explicitamente
- Respuestas en espanol

## Arquitectura

```
alfred.exe  (C++ backend)          Alfred.UI.exe  (WinUI 3 frontend)
    |                                      |
    | REST API localhost:8000              | lanza y gestiona alfred.exe
    |                                      |   como proceso hijo
    v                                      v
AlfredCore                         BackendProcessManager
  - LLMEngine (llama.cpp)            - StartAsync / StopAsync / Dispose
  - DBManager (SQLite)               - health check polling
  - GPUManager (CUDA detection)
  - QueryCache
```

- El frontend lanza `alfred.exe` como proceso hijo al arrancar
- Datos persistidos en `%APPDATA%\Alfred\` (SQLite, modelos GGUF, logs)
- La API REST expone: `/query`, `/health`, `/models`, `/conversations`, `/history`, `/gpu/status`, `/settings`

## Modelo de carga (lazy loading)

- Por defecto el modelo LLM se carga en demanda al primer query (`model_lazy_load = true`)
- Se descarga automaticamente tras N segundos de inactividad (`model_idle_timeout_sec`, configurable desde Settings)
- Sin modelo configurado: la UI guia al usuario a descargar uno desde HuggingFace via la pagina de Modelos

## Estructura de directorios relevante

```
/                        raiz del repo
  src/app/               fuentes C++ del backend
  include/alfred/        headers C++
  ui/Alfred.UI/          proyecto WinUI 3
    Pages/               paginas de la app (Chat, Models, Settings, ...)
    Services/            AlfredApiClient, BackendProcessManager, ...
    Models/              DTOs para la API REST
  .github/workflows/     CI/CD (build-release.yml, build-cpu.yml)
  build/                 salida de CMake (no committear)
```
