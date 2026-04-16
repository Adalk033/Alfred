# Plan de Trabajo Pendiente — Alfred v0.2.0

> Generado el 2026-04-14  
> Estado: COMPLETADO (2026-04-14)  
> Este archivo documenta exactamente que falta por hacer, archivo por archivo.

---

## Resumen de lo YA completado

| # | Archivo | Cambio |
|---|---------|--------|
| ✅ | `CMakeLists.txt` | BUILD_TYPE=Release por defecto, CUDA archs configurables (75/86/89), install target, version define, /GL+/LTCG para MSVC |
| ✅ | `src/app/endpoints.cpp` | Helpers `get_int_param`/`get_float_param` reemplazando 3 bloques copy-paste de stoi/stof; GPU JSON parse protegido; runtime update de `model_idle_timeout_sec` |
| ✅ | `src/app/llm_engine.cpp` | RAII para sampler (`unique_ptr` + deleter), path parsing con `std::filesystem`, eliminada `model_size_mb()` que siempre retornaba 0 |
| ✅ | `include/alfred/llm_engine.h` | Eliminada declaracion de `model_size_mb()` |
| ✅ | `include/alfred/config.h` | Agregados `model_lazy_load` y `model_idle_timeout_sec` al struct `AppConfig` |
| ✅ | `include/alfred/alfred_core.h` | Includes `<atomic>/<thread>/<chrono>`, destructor explicito, miembros y metodos de lazy loading |
| ✅ | `src/app/alfred_core.cpp` | `build_llm_config()`, `ensure_model_loaded()`, `start_idle_monitor()`, `stop_idle_monitor()`; `initialize()` condicional; `query()` con lazy trigger y timestamp; `change_model()` con mutex; `get_stats()` expandido |
| ✅ | `src/app/endpoints.cpp` | `handle_root()` usa `ALFRED_VERSION` en vez de `"2.0.0"` hardcodeado |
| ✅ | `ui/Alfred.UI/Services/BackendProcessManager.cs` | Eliminados paths absolutos hardcodeados; agregado `backend/`; lambdas → metodos nombrados; `Dispose()` desuscribe eventos |
| ✅ | `ui/Alfred.UI/Pages/ChatPage.xaml.cs` | `UpdateAttachmentPanel()` desuscribe Click handlers antes de reemplazar ItemsSource |
| ✅ | `ui/Alfred.UI/MainWindow.xaml.cs` | `OnWindowClosed()` desuscribe `StatusChanged` y llama `_backend.Dispose()` |
| ✅ | `ui/Alfred.UI/Services/AlfredApiClient.cs` | `HttpClient.Timeout=InfiniteTimeSpan`; timeouts por operacion via CTS; logging de errores en helpers |
| ✅ | `ui/Alfred.UI/Pages/SettingsPage.xaml` | Agregada seccion "Modelo LLM" con `NumberBox` para idle timeout |
| ✅ | `ui/Alfred.UI/Pages/SettingsPage.xaml.cs` | `LoadAllSettings()` carga `model_idle_timeout_sec`; handler `OnIdleTimeoutChanged` persiste y actualiza hint |
| ✅ | `.github/workflows/build-release.yml` | Workflow CUDA: build backend + frontend + GitHub Release con ZIP |
| ✅ | `.github/workflows/build-cpu.yml` | Workflow CPU-only: mismo flujo sin CUDA, genera ZIP `-cpu` |
| ✅ | `.github/copilot-instructions.md` | Reemplazado contenido obsoleto (Electron/FastAPI) con stack actual |

---

## ✅ COMPLETADO 1 — Backend C++: Lazy Loading del Modelo

### 1.1 `include/alfred/config.h`
**Que hacer:** Agregar dos campos al struct `AppConfig` (despues del bloque `query_cache_*`):

```cpp
// --- Carga del modelo ---
// Si true, el modelo se carga al primer query (no al arrancar).
// Libera VRAM hasta que se necesite.
bool model_lazy_load        = true;
// Segundos de inactividad antes de descargar el modelo automaticamente.
// 0 = nunca descargar automaticamente.
int  model_idle_timeout_sec = 10;
```

---

### 1.2 `include/alfred/alfred_core.h`
**Que hacer:**

1. Agregar includes al inicio (tras los existentes):
```cpp
#include <atomic>
#include <thread>
#include <chrono>
```

2. Agregar miembros privados al final de la seccion `private:` (despues de `cache_evict_expired()`):
```cpp
// --- Lazy loading del modelo ---
std::string             pending_model_path_;       // ruta del modelo a cargar en demanda
std::mutex              model_load_mutex_;          // protege carga/descarga concurrente del modelo
std::thread             idle_monitor_thread_;       // hilo que vigila inactividad
std::atomic<bool>       stop_monitor_{ false };     // senal de parada para el hilo monitor
std::atomic<int64_t>    last_query_ns_{ 0 };        // timestamp (ns) del ultimo query exitoso

void ensure_model_loaded();   // carga el modelo si no esta cargado
void start_idle_monitor();    // arranca el hilo monitor
void stop_idle_monitor();     // para y une el hilo monitor
```

3. Cambiar el destructor de `~AlfredCore() = default;` a una declaracion explicita para que llame `stop_idle_monitor()`.

---

### 1.3 `src/app/alfred_core.cpp`
Este es el cambio mas grande. Todos los puntos a continuacion se aplican a este archivo.

#### a) Destructor
```cpp
AlfredCore::~AlfredCore() {
    stop_idle_monitor();
}
```

#### b) `initialize()` — NO cargar el modelo si `model_lazy_load = true`

Localizar el bloque `// 2. Cargar modelo LLM` (lineas 44-77 aprox).  
Reemplazar la llamada directa a `llm_->load_model()` por logica condicional:

```cpp
// Determinar ruta del modelo
std::string llm_path;
auto& db = DBManager::instance();
auto last_llm = db.get_model_setting("last_used_model");
if (last_llm && !last_llm->empty())
    cfg.llm_model_file = std::filesystem::path(*last_llm).filename().string();

if (!cfg.llm_model_file.empty())
    llm_path = cfg.models_dir + "/" + cfg.llm_model_file;

// Cargar timeout desde DB si esta persistido
auto saved_timeout = db.get_app_setting("model_idle_timeout_sec");
if (saved_timeout) {
    try { cfg.model_idle_timeout_sec = std::stoi(*saved_timeout); } catch (...) {}
}

if (llm_path.empty() || !std::filesystem::exists(llm_path)) {
    log_warn("Sin modelo LLM configurado. Usa la UI para descargar y seleccionar uno.");
} else if (cfg.model_lazy_load) {
    pending_model_path_ = llm_path;
    log_info("Modelo configurado para carga lazy: " + pending_model_path_);
} else {
    // Carga inmediata (comportamiento legacy)
    LLMConfig llm_config = build_llm_config(llm_path);
    if (!llm_->load_model(llm_config))
        log_error("Error cargando modelo LLM");
}

// Arrancar monitor de inactividad en ambos modos
start_idle_monitor();
```

Extraer la construccion del `LLMConfig` a un metodo privado auxiliar `build_llm_config(path)` para evitar duplicacion con `change_model()` y `ensure_model_loaded()`:

```cpp
LLMConfig AlfredCore::build_llm_config(const std::string& model_path) {
    auto& cfg = get_config();
    auto& gpu = GPUManager::instance();
    LLMConfig c;
    c.model_path    = model_path;
    c.n_ctx         = cfg.n_ctx;
    c.n_gpu_layers  = gpu.has_cuda() ? cfg.n_gpu_layers : 0;
    c.n_batch       = cfg.n_batch;
    c.n_threads     = cfg.n_threads;
    c.temperature   = cfg.temperature;
    c.top_p         = cfg.top_p;
    c.max_tokens    = cfg.max_tokens;
    c.seed          = cfg.seed;
    return c;
}
```

Declarar `build_llm_config` como metodo privado en `alfred_core.h`.

#### c) Nuevo metodo `ensure_model_loaded()`

```cpp
void AlfredCore::ensure_model_loaded() {
    std::lock_guard<std::mutex> lock(model_load_mutex_);
    if (llm_->is_loaded() || pending_model_path_.empty()) return;

    log_info("Cargando modelo en demanda: " + pending_model_path_);
    if (!llm_->load_model(build_llm_config(pending_model_path_)))
        log_error("Error en carga lazy del modelo LLM");
}
```

#### d) Nuevo metodo `start_idle_monitor()`

```cpp
void AlfredCore::start_idle_monitor() {
    last_query_ns_ = std::chrono::steady_clock::now().time_since_epoch().count();
    stop_monitor_  = false;
    idle_monitor_thread_ = std::thread([this]() {
        while (!stop_monitor_) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            if (stop_monitor_) break;

            auto& cfg = get_config();
            if (cfg.model_idle_timeout_sec <= 0) continue;

            std::lock_guard<std::mutex> lock(model_load_mutex_);
            if (!llm_->is_loaded()) continue;

            auto now_ns  = std::chrono::steady_clock::now().time_since_epoch().count();
            auto idle_sec = (now_ns - last_query_ns_.load()) / 1'000'000'000LL;

            if (idle_sec >= cfg.model_idle_timeout_sec) {
                log_info("Modelo inactivo " + std::to_string(idle_sec) +
                         "s, descargando recursos...");
                llm_->unload_model();
            }
        }
    });
}
```

#### e) Nuevo metodo `stop_idle_monitor()`

```cpp
void AlfredCore::stop_idle_monitor() {
    stop_monitor_ = true;
    if (idle_monitor_thread_.joinable())
        idle_monitor_thread_.join();
}
```

#### f) `query()` — llamar `ensure_model_loaded()` y actualizar timestamp

Al inicio del metodo `query()`, antes del cache lookup:
```cpp
ensure_model_loaded();
```

Justo antes del `return result` final (despues de guardar en historial y cache):
```cpp
last_query_ns_ = std::chrono::steady_clock::now().time_since_epoch().count();
```

#### g) `change_model()` — integrar con lazy loading

Modificar para que actualice `pending_model_path_` y respete `model_lazy_load`:

```cpp
bool AlfredCore::change_model(const std::string& model_path) {
    log_info("Cambiando modelo LLM a: " + model_path);
    auto& cfg = get_config();

    std::lock_guard<std::mutex> lock(model_load_mutex_);
    llm_->unload_model();

    if (cfg.model_lazy_load) {
        pending_model_path_ = model_path;
        DBManager::instance().set_model_setting("last_used_model", model_path);
        clear_cache();
        log_info("Modelo configurado para carga lazy: " + model_path);
        return true;
    }

    bool success = llm_->load_model(build_llm_config(model_path));
    if (success) {
        pending_model_path_ = model_path;
        DBManager::instance().set_model_setting("last_used_model", model_path);
        clear_cache();
    }
    return success;
}
```

#### h) `get_stats()` — exponer estado del modelo y timeout

```cpp
json AlfredCore::get_stats() {
    json stats;
    stats["initialized"]           = initialized_;
    stats["model_loaded"]          = llm_->is_loaded();
    stats["model_idle_timeout_sec"] = get_config().model_idle_timeout_sec;
    stats["model_lazy_load"]       = get_config().model_lazy_load;
    stats["llm_model"]             = llm_->model_name();
    stats["cache_size"]            = query_cache_.size();
    stats["gpu"]                   = json::parse(GPUManager::instance().status_json());
    return stats;
}
```

---

### 1.4 `src/app/endpoints.cpp` — actualizar `handle_health()`

El `/health` ya retorna `core.get_stats()`. Con los cambios anteriores en `get_stats()`, automaticamente incluira `model_loaded` y `model_idle_timeout_sec`. **No hay cambio adicional necesario aqui.**

Sin embargo, actualizar la version en `handle_root()`:
```cpp
data["version"] = ALFRED_VERSION;   // usa el define de CMake en vez de "2.0.0" hardcodeado
```

---

## PENDIENTE 2 — Frontend C#: Correcciones Criticas

### 2.1 `ui/Alfred.UI/Services/BackendProcessManager.cs`

#### a) Eliminar paths absolutos hardcodeados (lineas 167-169)

Reemplazar el array `searchPaths` completo. Eliminar las tres entradas con `F:\Projects\Alfred`:

```csharp
string[] searchPaths =
[
    // Produccion: junto al ejecutable de la UI
    Path.Combine(appDir, "alfred.exe"),
    // Estructura de instalador: backend/ junto a la UI
    Path.Combine(appDir, "backend", "alfred.exe"),
    // Desarrollo: build en raiz del repo (Ninja/Make)
    Path.Combine(appDir, "..", "..", "..", "..", "build", "alfred.exe"),
    // Desarrollo: build Visual Studio Debug
    Path.Combine(appDir, "..", "..", "..", "..", "build", "Debug", "alfred.exe"),
    // Desarrollo: build Visual Studio Release
    Path.Combine(appDir, "..", "..", "..", "..", "build", "Release", "alfred.exe"),
];
```

Si no se encuentra el ejecutable, el mensaje de error debe ser claro:
```csharp
StatusChanged?.Invoke(this, "error: alfred.exe no encontrado. Reinstala la aplicacion.");
```

#### b) Desuscribir eventos del proceso en `Dispose()`

Antes de llamar `_process.Kill()` en `Dispose()`, desuscribir handlers:

```csharp
public void Dispose()
{
    if (_disposed) return;
    _disposed = true;

    if (_process != null)
    {
        // Desuscribir para evitar que fires post-dispose
        _process.OutputDataReceived -= OnOutputData;
        _process.ErrorDataReceived  -= OnErrorData;
        _process.Exited             -= OnExited;

        if (!_process.HasExited)
            try { _process.Kill(entireProcessTree: true); } catch { }

        _process.Dispose();
        _process = null;
    }
}
```

**Nota:** Esto requiere refactorizar los lambdas anonimos de `StartAsync()` en metodos nombrados (`OnOutputData`, `OnErrorData`, `OnExited`) para poder desuscribirlos.

Ejemplo de refactor en `StartAsync()`:
```csharp
_process.OutputDataReceived += OnOutputData;
_process.ErrorDataReceived  += OnErrorData;
_process.Exited             += OnExited;
```

Con los metodos:
```csharp
private void OnOutputData(object sender, DataReceivedEventArgs e)
{
    if (!string.IsNullOrEmpty(e.Data))
        OutputReceived?.Invoke(this, e.Data);
}
private void OnErrorData(object sender, DataReceivedEventArgs e)
{
    if (!string.IsNullOrEmpty(e.Data))
        OutputReceived?.Invoke(this, e.Data);
}
private void OnExited(object? sender, EventArgs e)
{
    StatusChanged?.Invoke(this, "stopped");
}
```

---

### 2.2 `ui/Alfred.UI/Pages/ChatPage.xaml.cs`

#### Event handler leak en `UpdateAttachmentPanel()` (linea 388)

**Problema:** Cada llamada a `UpdateAttachmentPanel()` crea nuevos `Button` con `removeBtn.Click += OnRemoveSingleAttachment`. Al reemplazar `AttachmentList.ItemsSource`, los botones anteriores quedan referenciados por sus handlers sin desuscribir.

**Fix:** Desuscribir antes de reemplazar el ItemsSource. Al inicio de `UpdateAttachmentPanel()`:

```csharp
private void UpdateAttachmentPanel()
{
    // Desuscribir handlers de chips anteriores
    if (AttachmentList.ItemsSource is List<UIElement> oldChips)
    {
        foreach (var elem in oldChips)
            if (elem is Border { Child: StackPanel sp })
                foreach (var btn in sp.Children.OfType<Button>())
                    btn.Click -= OnRemoveSingleAttachment;
    }
    AttachmentList.ItemsSource = null;

    if (_attachedFiles.Count == 0)
    {
        AttachmentPanel.Visibility = Visibility.Collapsed;
        return;
    }
    // ... resto del codigo sin cambios
```

---

### 2.3 `ui/Alfred.UI/MainWindow.xaml.cs`

#### Evento `_backend.StatusChanged` no desuscrito en `OnWindowClosed()`

En el metodo `OnWindowClosed()` (linea 206), agregar la desuscripcion que falta:

```csharp
private void OnWindowClosed(object sender, WindowEventArgs args)
{
    _healthTimer.Stop();
    _backend.StatusChanged -= OnBackendStatusChanged;                    // AGREGAR ESTA LINEA
    NotificationService.Instance.NotificationRequested -= OnNotificationRequested;
    _backend.StopAsync().GetAwaiter().GetResult();
    _backend.Dispose();                                                   // AGREGAR ESTA LINEA
    _api.Dispose();
}
```

---

### 2.4 `ui/Alfred.UI/Services/AlfredApiClient.cs`

**Problema:** Un solo `HttpClient` con `Timeout = 300s` para todas las operaciones. Health checks y operaciones simples esperan 300s antes de dar error.

**Fix:** Mantener el `HttpClient` con timeout largo (300s para model change), pero pasar `CancellationToken` por operacion con timeouts cortos:

1. Cambiar el constructor para dejar el `HttpClient.Timeout` en `Timeout.InfiniteTimeSpan` y controlar timeouts via CTS:

```csharp
_http = new HttpClient
{
    BaseAddress = new Uri(_baseUrl),
    Timeout = Timeout.InfiniteTimeSpan   // cada metodo controla su propio timeout
};
```

2. Refactorizar `GetAsync<T>` para aceptar timeout y diferenciar errores:

```csharp
private async Task<T?> GetAsync<T>(string endpoint, int timeoutSec = 15)
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
    try
    {
        var response = await _http.GetAsync(endpoint, cts.Token);
        if (!response.IsSuccessStatusCode) return default;
        var json = await response.Content.ReadAsStringAsync(cts.Token);
        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }
    catch (OperationCanceledException)
    {
        System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Timeout GET {endpoint}");
        return default;
    }
    catch (HttpRequestException ex)
    {
        System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Conexion GET {endpoint}: {ex.Message}");
        return default;
    }
    catch (Exception ex)
    {
        System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Error GET {endpoint}: {ex.Message}");
        return default;
    }
}
```

3. Aplicar el mismo patron a `PostAsync<T>`, `PostRawAsync`, `PutAsync`, `DeleteAsync`.

4. Ajustar timeouts por tipo de operacion:

| Operacion | Metodo | Timeout recomendado |
|-----------|--------|---------------------|
| `IsHealthyAsync` | GET /health | 5s |
| `GetHealthAsync` | GET /health | 5s |
| `GetGpuStatusAsync` | GET /gpu/status | 10s |
| `GetModelStatusAsync` | GET /models/status | 10s |
| `ListConversationsAsync` | GET /conversations | 15s |
| `GetHistoryAsync` | GET /history | 15s |
| `SearchHistoryAsync` | GET /history/search | 15s |
| `GetUserSettingsAsync` | GET /user/settings | 15s |
| `SetUserSettingAsync` | POST /user/settings | 15s |
| `GetEncryptionStatusAsync` | GET /encryption/status | 10s |
| `SetupEncryptionAsync` | POST /encryption/setup | 15s |
| `SendQueryAsync` | POST /query | 180s |
| `SendQueryWithAttachmentAsync` | POST /query | 180s |
| `SendConversationQueryAsync` | POST /conversations/.../query | 180s |
| `ChangeModelAsync` | POST /models/change | 300s |

5. Para `IsHealthyAsync` en particular (usado por el health timer cada 15s):
```csharp
public async Task<bool> IsHealthyAsync()
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    try
    {
        var response = await _http.GetAsync("/health", cts.Token);
        return response.IsSuccessStatusCode;
    }
    catch (OperationCanceledException)
    {
        return false;
    }
    catch
    {
        return false;
    }
}
```

---

### 2.5 `ui/Alfred.UI/Pages/SettingsPage.xaml` y `SettingsPage.xaml.cs`

**Objetivo:** Agregar un control para configurar el timeout de descarga automatica del modelo.

#### En `SettingsPage.xaml`:
Agregar una nueva seccion de configuracion del modelo (antes o despues de la seccion de GPU). Ejemplo de estructura XAML:

```xml
<!-- Seccion: Modelo LLM -->
<StackPanel Spacing="8" Margin="0,0,0,16">
    <TextBlock Text="Modelo LLM" Style="{StaticResource SubtitleTextBlockStyle}"/>

    <Grid ColumnSpacing="12">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="*"/>
            <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>

        <StackPanel Grid.Column="0" Spacing="4">
            <TextBlock Text="Descargar modelo tras inactividad"/>
            <TextBlock Text="Libera VRAM cuando el modelo no se usa"
                       Style="{StaticResource CaptionTextBlockStyle}"
                       Opacity="0.6"/>
        </StackPanel>

        <NumberBox x:Name="IdleTimeoutBox"
                   Grid.Column="1"
                   Minimum="0"
                   Maximum="3600"
                   SmallChange="5"
                   LargeChange="30"
                   Width="120"
                   PlaceholderText="segundos"
                   ValueChanged="OnIdleTimeoutChanged"/>
    </Grid>
    <TextBlock x:Name="IdleTimeoutHint"
               Text="0 = nunca descargar automaticamente"
               Style="{StaticResource CaptionTextBlockStyle}"
               Opacity="0.5"/>
</StackPanel>
```

#### En `SettingsPage.xaml.cs`:

1. En `OnNavigatedTo` (o equivalente de carga de pagina), cargar el valor guardado:
```csharp
var timeoutStr = await _api.GetAppSettingAsync("model_idle_timeout_sec");
if (int.TryParse(timeoutStr, out int timeout))
    IdleTimeoutBox.Value = timeout;
else
    IdleTimeoutBox.Value = 10; // defecto
```

2. Handler del cambio:
```csharp
private async void OnIdleTimeoutChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
{
    if (double.IsNaN(args.NewValue)) return;
    int secs = (int)args.NewValue;
    await _api.SetAppSettingAsync("model_idle_timeout_sec", secs.ToString());

    // Actualizar hint informativo
    IdleTimeoutHint.Text = secs == 0
        ? "El modelo permanecera cargado hasta que cierres la app"
        : $"El modelo se descargara tras {secs} segundos sin consultas";
}
```

---

## PENDIENTE 3 — GitHub Actions CI/CD

### 3.1 Crear `.github/workflows/build-release.yml`

**Trigger:** Push de tags `v*.*.*` O ejecucion manual (`workflow_dispatch` con input de version).

**Estructura del workflow:**

```yaml
name: Build and Release Alfred

on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version (ej: 0.2.1)'
        required: true

env:
  DOTNET_VERSION: '9.0.x'
  CUDA_VERSION: '12.4.0'

jobs:

  # ============================================================
  # Job 1: Compilar backend C++ con CUDA (Windows)
  # ============================================================
  build-backend:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Instalar CUDA Toolkit ${{ env.CUDA_VERSION }}
        uses: Jimver/cuda-toolkit@v0.2.15
        with:
          cuda: ${{ env.CUDA_VERSION }}
          method: 'network'
          sub-packages: '["nvcc", "cudart", "cublas", "cufft"]'

      - name: Configurar CMake (Release + CUDA)
        run: |
          cmake -S . -B build `
            -DCMAKE_BUILD_TYPE=Release `
            -DALFRED_CUDA=ON `
            -DALFRED_CUDA_ARCH="75;86;89"

      - name: Compilar
        run: cmake --build build --config Release --parallel

      - name: Subir artifact del backend
        uses: actions/upload-artifact@v4
        with:
          name: alfred-backend
          path: |
            build/Release/alfred.exe
            build/Release/*.dll
          if-no-files-found: error

  # ============================================================
  # Job 2: Compilar frontend WinUI 3 (Windows)
  # ============================================================
  build-frontend:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Instalar .NET ${{ env.DOTNET_VERSION }}
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Restaurar dependencias NuGet
        run: dotnet restore ui/Alfred.UI/Alfred.UI.csproj

      - name: Publicar UI
        run: |
          dotnet publish ui/Alfred.UI/Alfred.UI.csproj `
            --configuration Release `
            --runtime win-x64 `
            --self-contained true `
            --output publish/Alfred.UI `
            /p:WindowsPackageType=None `
            /p:PublishSingleFile=false

      - name: Subir artifact del frontend
        uses: actions/upload-artifact@v4
        with:
          name: alfred-frontend
          path: publish/Alfred.UI/
          if-no-files-found: error

  # ============================================================
  # Job 3: Empaquetar y crear GitHub Release
  # ============================================================
  package-release:
    runs-on: windows-latest
    needs: [build-backend, build-frontend]
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Obtener version
        id: version
        run: |
          if ("${{ github.event_name }}" -eq "workflow_dispatch") {
            echo "VERSION=${{ github.event.inputs.version }}" >> $env:GITHUB_ENV
          } else {
            $tag = "${{ github.ref_name }}"
            echo "VERSION=$($tag.TrimStart('v'))" >> $env:GITHUB_ENV
          }

      - name: Descargar artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts/

      - name: Crear estructura de distribucion
        run: |
          $dist = "Alfred-v${{ env.VERSION }}"
          New-Item -ItemType Directory -Path $dist
          Copy-Item -Path "artifacts/alfred-backend/*"  -Destination $dist -Recurse
          Copy-Item -Path "artifacts/alfred-frontend/*" -Destination $dist -Recurse
          @"
          Alfred v${{ env.VERSION }}
          ========================
          Asistente de IA local para Windows.

          Requisitos:
          - Windows 10 (19041) o superior
          - GPU NVIDIA con CUDA (RTX 20xx, 30xx o 40xx) recomendado
          - .NET 9 Runtime (incluido en este paquete)

          Uso:
          1. Ejecutar Alfred.UI.exe
          2. Ir a Modelos y descargar un modelo GGUF de HuggingFace
          3. Seleccionar el modelo y empezar a chatear

          Los datos se guardan en: %APPDATA%\Alfred\
          "@ | Out-File "$dist\LEEME.txt" -Encoding UTF8

      - name: Comprimir
        run: Compress-Archive -Path "Alfred-v${{ env.VERSION }}" -DestinationPath "Alfred-v${{ env.VERSION }}-win-x64.zip"

      - name: Crear GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ env.VERSION }}
          name: Alfred v${{ env.VERSION }}
          draft: false
          prerelease: false
          files: Alfred-v${{ env.VERSION }}-win-x64.zip
          body: |
            ## Alfred v${{ env.VERSION }}

            ### Instalacion
            1. Descargar `Alfred-v${{ env.VERSION }}-win-x64.zip`
            2. Extraer en cualquier carpeta
            3. Ejecutar `Alfred.UI.exe`
            4. En la pantalla de Modelos, descargar un modelo GGUF

            ### Requisitos
            - Windows 10 (19041+) o Windows 11
            - GPU NVIDIA (RTX 20xx/30xx/40xx) para aceleracion CUDA
            - Sin GPU: funciona en CPU (mas lento)
```

### 3.2 Crear `.github/workflows/build-cpu.yml` (CPU-only, sin CUDA)

Mismo workflow que el anterior pero con `-DALFRED_CUDA=OFF`.  
Artifact: `Alfred-v{version}-win-x64-cpu.zip`.  
Trigger: mismo que el principal.

---

## PENDIENTE 4 — Documentacion

### 4.1 Actualizar `.github/copilot-instructions.md`

El archivo actual menciona "Electron" y "FastAPI" que ya no existen. Reemplazar completamente con el stack actual:

```markdown
# Alfred — Instrucciones para asistentes de codigo

## Stack Tecnologico
- **Backend:** C++20, CMake 3.20+, llama.cpp (GGUF), cpp-httplib, SQLite3, spdlog, nlohmann/json
- **GPU:** CUDA nativo via ggml backend (NO Ollama, NO Python)
- **Frontend:** WinUI 3, .NET 9, C#, CommunityToolkit.Mvvm
- **Plataforma:** Windows 10.0.19041+ exclusivamente

## Convenciones
- Comentarios y logs en **espanol sin tildes ni enies** (compatibilidad ASCII)
- No crear archivos README ni documentacion adicional salvo que se pida
- Respuestas en espanol

## Arquitectura
- Backend expone API REST en localhost:8000
- Frontend (Alfred.UI.exe) lanza y gestiona backend (alfred.exe) como proceso hijo
- Datos persistidos en %APPDATA%\Alfred\ (SQLite, modelos GGUF, logs)

## Modelo de carga
- Por defecto el modelo LLM se carga en demanda (primer query)
- Se descarga automaticamente tras N segundos de inactividad (configurable)
- Sin modelo configurado: UI guia al usuario a descargar uno desde HuggingFace
```

---

## Orden de implementacion recomendado

```
1. ✅ include/alfred/config.h
2. ✅ include/alfred/alfred_core.h
3. ✅ src/app/alfred_core.cpp
4. ✅ src/app/endpoints.cpp          — handle_root version
5. ✅ BackendProcessManager.cs
6. ✅ ChatPage.xaml.cs
7. ✅ MainWindow.xaml.cs
8. ✅ AlfredApiClient.cs
9. ✅ SettingsPage.xaml + .cs
10. ✅ .github/workflows/build-*.yml
11. ✅ .github/copilot-instructions.md
```

## Verificacion post-implementacion

- [ ] Compilar backend en Release con CUDA: `cmake -S . -B build -DALFRED_CUDA=ON && cmake --build build --config Release`
- [ ] Arrancar app, abrir Task Manager → sin modelo cargado (VRAM = 0)
- [ ] Enviar primera consulta → VRAM sube (modelo cargandose)
- [ ] Esperar timeout (10s default) → VRAM vuelve a 0
- [ ] Cambiar timeout desde Settings → nuevo valor activo inmediatamente
- [ ] Cambiar modelo desde Models → carga lazy aplicada
- [ ] Arrancar UI sin `alfred.exe` en rutas absolutas de desarrollo → error claro "no encontrado"
- [ ] GitHub Action: crear tag `v0.2.1` → workflow genera ZIP descargable en Releases

---

## Auditoria de implementacion (2026-04-14)

> Revision linea por linea de cada item del plan contra el codigo fuente real del proyecto.
> Resultado: **TODOS los 11 items del plan estan correctamente implementados.**

---

### Auditoria 1 — Backend C++: Lazy Loading del Modelo

#### 1.1 `include/alfred/config.h` — ✅ CORRECTO
| Campo | Linea | Valor | Estado |
|-------|-------|-------|--------|
| `model_lazy_load` | 48 | `true` | OK |
| `model_idle_timeout_sec` | 51 | `10` | OK |
| Comentarios explicativos | 45-51 | Presentes | OK |

#### 1.2 `include/alfred/alfred_core.h` — ✅ CORRECTO
| Elemento | Linea | Estado |
|----------|-------|--------|
| `#include <atomic>` | 11 | OK |
| `#include <thread>` | 12 | OK |
| `#include <chrono>` | 13 | OK |
| `pending_model_path_` | 92 | OK |
| `model_load_mutex_` | 93 | OK |
| `idle_monitor_thread_` | 94 | OK |
| `stop_monitor_{ false }` | 95 | OK |
| `last_query_ns_{ 0 }` | 96 | OK |
| `build_llm_config()` declarado | 98 | OK |
| `ensure_model_loaded()` declarado | 99 | OK |
| `start_idle_monitor()` declarado | 100 | OK |
| `stop_idle_monitor()` declarado | 101 | OK |
| Destructor explicito `~AlfredCore()` | 41 | OK |

#### 1.3 `src/app/alfred_core.cpp` — ✅ CORRECTO
| Metodo/Cambio | Lineas | Estado |
|---------------|--------|--------|
| Destructor llama `stop_idle_monitor()` | 28-29 | OK |
| `initialize()` con carga condicional lazy | 46-78 | OK |
| Lee `model_idle_timeout_sec` de DB | 60-63 | OK |
| `build_llm_config()` como metodo auxiliar | 99-113 | OK |
| `ensure_model_loaded()` con mutex | 115-122 | OK |
| `start_idle_monitor()` con hilo monitor | 124-148 | OK |
| `stop_idle_monitor()` con join | 150-154 | OK |
| `query()` llama `ensure_model_loaded()` | 299 | OK |
| `query()` actualiza `last_query_ns_` | 348 | OK |
| `change_model()` con lazy loading y mutex | 354-376 | OK |
| `get_stats()` expone `model_loaded`, `model_idle_timeout_sec`, `model_lazy_load` | 378-388 | OK |

#### 1.4 `src/app/endpoints.cpp` — ✅ CORRECTO
| Cambio | Lineas | Estado |
|--------|--------|--------|
| Helper `get_int_param()` | 69-79 | OK |
| Helper `get_float_param()` | 83-94 | OK |
| GPU JSON parse protegido con try/catch | 549-553 | OK |
| Runtime update de `model_idle_timeout_sec` | 482-483 | OK |
| Runtime update de `model_lazy_load` | 484-485 | OK |
| `handle_root()` usa `ALFRED_VERSION` | 102 | OK |

#### 1.5 `src/app/llm_engine.cpp` — ✅ CORRECTO
| Cambio | Linea | Estado |
|--------|-------|--------|
| RAII para sampler (`unique_ptr` + deleter) | 248-249 | OK |
| Path parsing con `std::filesystem` | 103 | OK |
| `model_size_mb()` eliminada del engine | N/A | OK (no existe en llm_engine.h ni .cpp) |

#### 1.6 `CMakeLists.txt` — ✅ CORRECTO
| Cambio | Lineas | Estado |
|--------|--------|--------|
| `BUILD_TYPE=Release` por defecto | 13-16 | OK |
| CUDA archs configurables `75;86;89` | 25 | OK |
| Install target | 182-185 | OK |
| `ALFRED_VERSION` define | 172 | OK |
| `/GL` + `/LTCG` para MSVC Release | 177-178 | OK |

---

### Auditoria 2 — Frontend C#: Correcciones Criticas

#### 2.1 `BackendProcessManager.cs` — ✅ CORRECTO
| Cambio | Lineas | Estado |
|--------|--------|--------|
| Paths absolutos eliminados (solo relativos) | 146-158 | OK |
| Ruta `backend/` agregada | 151 | OK |
| Lambdas refactorizadas a metodos nombrados | 170-185 | OK (`OnOutputData`, `OnErrorData`, `OnExited`) |
| `Dispose()` desuscribe los 3 eventos | 193-196 | OK |
| Mensaje de error claro si no encontrado | 37 | OK |

#### 2.2 `ChatPage.xaml.cs` — ✅ CORRECTO
| Cambio | Lineas | Estado |
|--------|--------|--------|
| `UpdateAttachmentPanel()` desuscribe Click antes de reemplazar | 348-356 | OK |
| Pattern matching `Border { Child: StackPanel sp }` | 352 | OK |
| `AttachmentList.ItemsSource = null` antes de reconstruir | 356 | OK |

#### 2.3 `MainWindow.xaml.cs` — ✅ CORRECTO
| Cambio | Linea | Estado |
|--------|-------|--------|
| `_backend.StatusChanged -= OnBackendStatusChanged` | 209 | OK |
| `NotificationService.Instance.NotificationRequested -= ...` | 210 | OK |
| `_backend.Dispose()` | 212 | OK |
| `_api.Dispose()` | 213 | OK |

#### 2.4 `AlfredApiClient.cs` — ✅ CORRECTO
| Cambio | Lineas | Estado |
|--------|--------|--------|
| `HttpClient.Timeout = InfiniteTimeSpan` | 26-27 | OK |
| `GetAsync<T>` con timeout por CTS + logging | 280-305 | OK |
| `PostAsync<T>` con timeout por CTS + logging | 307-332 | OK |
| `PostRawAsync` con timeout | 334-350 | OK |
| `PutAsync` con timeout | 352-364 | OK |
| `DeleteAsync` con timeout | 366-378 | OK |
| `IsHealthyAsync` con 5s dedicado | 34-50 | OK |

**Timeouts por operacion verificados:**

| Operacion | Timeout plan | Timeout real | Estado |
|-----------|-------------|-------------|--------|
| `IsHealthyAsync` | 5s | 5s | OK |
| `GetHealthAsync` | 5s | 5s | OK |
| `GetGpuStatusAsync` | 10s | 10s | OK |
| `GetModelStatusAsync` | 10s | 10s | OK |
| `ListConversationsAsync` | 15s | 15s (default) | OK |
| `GetHistoryAsync` | 15s | 15s (default) | OK |
| `SearchHistoryAsync` | 15s | 15s (default) | OK |
| `SendQueryAsync` | 180s | 180s | OK |
| `SendQueryWithAttachmentAsync` | 180s | 180s | OK |
| `SendConversationQueryAsync` | 180s | 180s | OK |
| `ChangeModelAsync` | 300s | 300s | OK |

#### 2.5 `SettingsPage.xaml` + `.xaml.cs` — ✅ CORRECTO
| Cambio | Archivo | Lineas | Estado |
|--------|---------|--------|--------|
| Seccion "Modelo LLM" en XAML | `.xaml` | 137-177 | OK |
| `NumberBox` IdleTimeoutBox (min=0, max=3600) | `.xaml` | 160-169 | OK |
| `IdleTimeoutHint` TextBlock | `.xaml` | 172-175 | OK |
| `LoadAllSettings()` carga timeout de DB | `.xaml.cs` | 86-90 | OK |
| Default a 10 si no hay valor guardado | `.xaml.cs` | 90 | OK |
| `OnIdleTimeoutChanged` persiste y actualiza hint | `.xaml.cs` | 308-316 | OK |

---

### Auditoria 3 — GitHub Actions CI/CD

#### 3.1 `build-release.yml` (CUDA) — ✅ CORRECTO
| Elemento | Lineas | Estado |
|----------|--------|--------|
| Trigger: tags `v*.*.*` | 3-4 | OK |
| Trigger: `workflow_dispatch` con input version | 5-9 | OK |
| CUDA 12.4 toolkit install | 28-33 | OK |
| CMake `-DALFRED_CUDA=ON -DALFRED_CUDA_ARCH="75;86;89"` | 37-40 | OK |
| Backend artifact upload | 45-52 | OK |
| Frontend .NET 9 build + publish | 56-85 | OK |
| Package con LEEME.txt | 113-135 | OK |
| GitHub Release con `softprops/action-gh-release@v2` | 141-161 | OK |
| ZIP: `Alfred-v{VERSION}-win-x64.zip` | 138 | OK |

#### 3.2 `build-cpu.yml` (CPU-only) — ✅ CORRECTO
| Elemento | Lineas | Estado |
|----------|--------|--------|
| Mismo trigger que CUDA | 3-9 | OK |
| CMake `-DALFRED_CUDA=OFF` | 30-31 | OK |
| Artifact `alfred-backend-cpu` | 39 | OK |
| ZIP: `Alfred-v{VERSION}-win-x64-cpu.zip` | 129 | OK |
| Se sube a la misma Release | 132-139 | OK |

---

### Auditoria 4 — Documentacion

#### 4.1 `.github/copilot-instructions.md` — ✅ CORRECTO
| Elemento | Estado |
|----------|--------|
| Sin referencias a Electron/FastAPI | OK |
| Stack actual: C++20, CMake, llama.cpp, WinUI 3, .NET 9 | OK |
| Convenciones: espanol sin tildes | OK |
| Arquitectura: REST localhost:8000 | OK |
| Diagrama de componentes | OK |
| Modelo de carga lazy documentado | OK |
| Estructura de directorios | OK |

---

### Observaciones adicionales

1. **`gpu_manager.h` tiene `optimal_gpu_layers(size_t model_size_mb)`** — Este es un metodo de `GPUManager`, no de `LLMEngine`. El plan solo pedia eliminar `model_size_mb()` de `LLMEngine`, lo cual se hizo correctamente. No confundir con el parametro `model_size_mb` de GPUManager que es un concepto diferente.

2. **Coherencia de la version** — `CMakeLists.txt` define version `0.2.0`, `SettingsPage.xaml` muestra "Alfred 2.0.0" (linea 199). Hay una discrepancia menor en la UI que muestra `2.0.0` en vez de `0.2.0`. Esto no estaba en el plan original pero es un detalle a corregir en el futuro.

3. **`copilot-instructions.md`** — El archivo actualizado va mas alla de lo especificado en el plan: incluye un diagrama de arquitectura ASCII, seccion de estructura de directorios, y seccion de lazy loading. Esto es una mejora positiva.

4. **`build-cpu.yml`** — Comparte el job `build-frontend` con nombre identico al de `build-release.yml`. Si ambos workflows se ejecutan en paralelo por el mismo tag, podrian generar un conflicto de artifact names. Considerar renombrar a `alfred-frontend-cpu` en el workflow CPU para evitar colisiones.

5. **Los tests de verificacion post-implementacion** (seccion final) son pruebas manuales que requieren una maquina con GPU NVIDIA y un modelo GGUF descargado. No se pueden automatizar completamente en CI.

---

### Resumen ejecutivo

| Seccion | Items | Completados | Pendientes |
|---------|-------|-------------|------------|
| 1. Backend C++ Lazy Loading | 6 archivos | 6 | 0 |
| 2. Frontend C# Correcciones | 5 archivos | 5 | 0 |
| 3. GitHub Actions CI/CD | 2 workflows | 2 | 0 |
| 4. Documentacion | 1 archivo | 1 | 0 |
| **Total implementacion** | **14 archivos** | **14** | **0** |
| Verificacion manual | 8 pruebas | 0 | 8 |

**Estado final: Toda la implementacion de codigo esta completa. Quedan pendientes las 8 pruebas de verificacion manual post-implementacion.**
