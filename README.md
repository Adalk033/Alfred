# Alfred

Alfred is a local AI assistant for Windows. It combines a native C++20 backend with a WinUI 3 desktop interface and runs GGUF language models directly through llama.cpp. Inference, conversations, and document processing stay on the device; Alfred does not require Ollama, Python, a cloud LLM API, or an MCP server.

> Current project version: **v0.3.0 (beta)**. The official desktop distribution targets Windows x64.

## Highlights

- **Local GGUF inference** with lazy model loading and automatic unload after inactivity.
- **CUDA acceleration** for NVIDIA Turing, Ampere, and Ada GPUs, plus a CPU-only build.
- **Direct Hugging Face integration** to search GGUF repositories and download a selected model with progress and resume support.
- **Native WinUI 3 interface** with streaming responses, Markdown, code highlighting, quick prompts, and keyboard shortcuts.
- **Persistent conversations** in SQLite, including pinning, branching/regeneration, bulk deletion, and Markdown export.
- **Local attachments** with PDF text extraction through PDFium and support for text-based files as prompt context.
- **VRAM-aware model selection** and configurable generation parameters.
- **Local API protection** through a random per-session `X-Alfred-Token`; `/health` is the only unauthenticated endpoint and wildcard CORS is disabled.
- **VS Code agent protocol** through `/query/agent/stream`; tools run inside the extension with workspace sandboxing and user approval rather than inside Alfred.
- **Optional AES-256-GCM encryption** for newly stored conversation content, memory values, and selected profile fields when the backend is built with OpenSSL.

## Runtime architecture

The WinUI application starts and owns `alfred.exe`. The backend listens on `127.0.0.1:8000`, loads the selected GGUF model through llama.cpp, stores application data in SQLite, and streams generated tokens back to the UI. Closing the UI also terminates its managed backend process.

The application needs internet access only when you choose to search for or download a model from `huggingface.co`. Once a compatible GGUF file is available locally, inference works offline and prompts are not sent to Hugging Face or another remote service.

### MCP removal

Alfred v0.3.0 has no MCP server, MCP configuration page, or MCP runtime dependency. The VS Code agent protocol is independent from MCP: Alfred emits structured tool requests, while the extension executes approved workspace operations locally. A legacy `%APPDATA%\Alfred\mcp_servers.json` left by an older build is ignored. It is not removed automatically, so it can be deleted manually after confirming that no older Alfred installation still needs it.

## End-user requirements

- Windows 10 build 19041 or later, x64.
- x86-64 processor with AVX2 support. This is required by both packages because the CUDA build still runs model setup, tokenization, and other auxiliary operations on the CPU.
- Enough RAM and free disk space for the selected GGUF model; requirements vary significantly by model size and quantization.
- GPU package: NVIDIA RTX 20xx or newer with a compatible, up-to-date driver.
- CPU package: no NVIDIA GPU is required; generation is slower and still depends on the selected model fitting in system RAM.

## Installable packages

Both variants are published as an installer and a portable ZIP on the [Releases](https://github.com/Adalk033/Alfred/releases) page.

| Variant | Installer | Portable ZIP |
|---|---|---|
| GPU (CUDA) | `Alfred-vX.X.X-win-x64-setup.exe` | `Alfred-vX.X.X-win-x64.zip` |
| CPU-only | `Alfred-vX.X.X-cpu-win-x64-setup.exe` | `Alfred-vX.X.X-win-x64-cpu.zip` |

After installation, open **Models**, search for a GGUF repository, or copy an existing GGUF file into `%APPDATA%\Alfred\models\`. Then select the model and start a conversation. Models are not bundled with Alfred and remain subject to their authors' licenses and usage terms.

## Local data

| Location | Contents |
|---|---|
| `%APPDATA%\Alfred\db\alfred.db` | Conversations, memory, model configuration, and application settings |
| `%APPDATA%\Alfred\models\` | Downloaded GGUF models |
| `%APPDATA%\Alfred\logs\` | Backend diagnostic logs |
| `%APPDATA%\Alfred\data\secret.key` | Local encryption key when OpenSSL encryption is available |
| `%LOCALAPPDATA%\Alfred\preferences.json` | UI theme and interface preferences |
| `%LOCALAPPDATA%\Alfred\api-connection.json` | Ephemeral local API connection data for trusted desktop integrations; removed when Alfred closes |
| `%LOCALAPPDATA%\Alfred\logs\ui-crash.log` | UI crash details, when an unhandled error occurs |

Backend logs can include the first 80 characters of a prompt for diagnostics. See [SECURITY.md](SECURITY.md) and the [privacy policy](docs/privacy.html) before using highly sensitive data.

## Technology

| Layer | Technology |
|---|---|
| Backend | C++20, CMake, llama.cpp, cpp-httplib, SQLiteCpp |
| Frontend | C#, WinUI 3, Windows App SDK 1.6, .NET 9 |
| Acceleration | CUDA 13.2 in the GPU release; llama.cpp CPU backend otherwise |
| Supporting libraries | nlohmann/json, spdlog, PDFium, optional OpenSSL |

## Building from source

### Prerequisites

- Visual Studio 2022 Build Tools with the **Desktop development with C++** workload.
- CMake 3.20 or later and Git.
- .NET 9 SDK and MSBuild.
- CUDA Toolkit 13.2 for a CUDA build.
- OpenSSL development libraries only if AES-256-GCM support is required.
- Internet access during the first configure/restore so CMake and NuGet can fetch dependencies.

Run these commands from a Visual Studio Developer PowerShell:

```powershell
# Backend: CPU-only
cmake -S . -B build -DALFRED_CUDA=OFF
cmake --build build --config Release --parallel

# Backend: CUDA distribution build (Turing, Ampere, Ada)
cmake -S . -B build -DALFRED_CUDA=ON '-DALFRED_CUDA_ARCH=75;86;89'
cmake --build build --config Release --parallel

# Frontend: same configuration used by CI
dotnet workload restore --project ui/Alfred.UI/Alfred.UI.csproj
dotnet restore ui/Alfred.UI/Alfred.UI.csproj
msbuild ui/Alfred.UI/Alfred.UI.csproj /restore /m /verbosity:minimal `
  /p:Configuration=Release /p:Platform=x64 /p:RuntimeIdentifier=win-x64 `
  /p:SelfContained=true /p:WindowsAppSDKSelfContained=true
```

CMake fetches the pinned native dependencies with `FetchContent`; vcpkg is not required. The UI can locate a development backend at `build\Release\alfred.exe`, so run:

```powershell
.\ui\Alfred.UI\bin\x64\Release\net9.0-windows10.0.19041.0\win-x64\Alfred.UI.exe
```

The release workflows in `.github/workflows/` build the same frontend configuration, package the native runtimes, and produce the installer/ZIP names listed above.
