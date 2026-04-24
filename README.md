# Alfred

Alfred is a local AI assistant for Windows that runs entirely offline, with no external dependencies like Ollama or Python. It combines a native C++ backend with a modern WinUI 3 desktop interface, enabling private, on-device LLM inference using GGUF models from HuggingFace.

## Features

- **Offline inference** — powered by llama.cpp, no internet or cloud required
- **GPU acceleration** — native CUDA support for NVIDIA GPUs (Turing, Ampere, Ada)
- **Modern UI** — WinUI 3 frontend with conversation history and Markdown rendering
- **REST API backend** — local server on `localhost:8000` with endpoints for queries, models, conversations, and GPU status
- **Persistent conversations** — SQLite-backed history and context management
- **PDF support** — extract and query text from PDF files
- **Query caching** — LRU cache for repeated queries
- **Lazy model loading** — models load on demand and unload after inactivity
- **AES-256-GCM encryption** — for sensitive stored data

## Requirements

- Windows 10 (build 19041) or later, 64-bit
- For the GPU version: NVIDIA GPU (Turing / RTX 20xx or newer) with up-to-date drivers

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | C++20, CMake, llama.cpp, cpp-httplib, SQLite, OpenSSL |
| Frontend | WinUI 3, Windows App SDK 1.6, .NET 9, C# |
| GPU | CUDA Toolkit 13.2 |
| Extras | nlohmann/json, spdlog, PDFium |

## Building from Source

```bash
# GPU (CUDA) build — adjust ALFRED_CUDA_ARCH to your GPU generation
cmake -S . -B build -DALFRED_CUDA=ON -DALFRED_CUDA_ARCH=89
cmake --build build --config Release

# CPU-only build
cmake -S . -B build -DALFRED_CUDA=OFF
cmake --build build --config Release
```

Dependencies are fetched automatically via CMake FetchContent — no vcpkg or manual setup required.

---

## Installable Versions

Alfred is distributed in two variants. Choose the one that matches your hardware:

### Alfred (GPU — CUDA)
Recommended for users with a compatible NVIDIA GPU. Provides significantly faster inference through native CUDA acceleration.

> `Alfred-vX.X.X-win-x64-setup.exe` / `Alfred-vX.X.X-win-x64.zip`

### Alfred (CPU-only)
For systems without a dedicated NVIDIA GPU. Runs entirely on the CPU — slower for large models, but fully functional.

> `Alfred-vX.X.X-cpu-win-x64-setup.exe` / `Alfred-vX.X.X-cpu-win-x64.zip`

Both variants are available as an **installer** (recommended) or a **portable ZIP**. Download from the [Releases](../../releases) page.
