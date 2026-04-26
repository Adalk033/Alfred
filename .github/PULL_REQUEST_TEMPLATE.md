<!--
Plantilla de Pull Request para Alfred.

Para cambios que tocan inferencia, GPU o el LLMEngine, completa la seccion
"Hardware / modelo / logs" con la salida real de tus pruebas. Sin esos datos
es practicamente imposible reproducir o validar regresiones de rendimiento.
-->

## Resumen

<!-- Que cambia y por que. 1-3 viñetas -->
-

## Tipo de cambio

- [ ] Bug fix
- [ ] Nueva feature
- [ ] Refactor / limpieza
- [ ] Cambios de UI / UX
- [ ] Cambios de inferencia / GPU / modelos
- [ ] Docs / build / CI

## Hardware / modelo / logs

<!--
Obligatorio si tu cambio toca: src/app/llm_engine.cpp, gpu_manager.cpp,
endpoints de /query*, /models*, /gpu* o configuracion de inferencia.
Tip: pega la salida de:
  GET http://127.0.0.1:8000/gpu/report
  GET http://127.0.0.1:8000/models/status
  GET http://127.0.0.1:8000/models/config
-->

**GPU / sistema**
```
device_name:
vram_total_mb / vram_free_mb:
has_cuda / cuda_version:
cpu_cores:
OS:
```

**Modelo y parametros**
```
llm_model:
n_ctx / n_gpu_layers / n_batch / n_ubatch:
flash_attn / offload_kqv / cache_type_k / cache_type_v:
temperature / top_p / max_tokens:
```

**Logs / metricas relevantes**
```
[pega las ultimas 20-30 lineas del log del backend o del UI con la feature ejecutada]
```

## Test plan

<!-- Marca lo que probaste. Anade detalles cuando aplique. -->

- [ ] `dotnet build` (UI) en x64 sin warnings nuevos
- [ ] CMake build del backend sin warnings nuevos
- [ ] Tests automatizados (`tests/` y/o `dotnet test`) verdes
- [ ] Probado manualmente el camino feliz
- [ ] Probado caso(s) de borde: ___
- [ ] Probado con modelo cargado y sin modelo cargado
- [ ] Sin regresion observada en streaming / cancelacion / adjuntos

## Capturas / GIFs

<!-- Si tocaste UI, una captura ayuda muchisimo. -->

## Notas para revisores

<!-- Decisiones de diseño, deuda dejada para otro PR, links a issues, etc. -->
