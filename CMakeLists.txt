cmake_minimum_required(VERSION 3.20)
project(AlfredCpp
    VERSION 0.3.0
    LANGUAGES CXX
    DESCRIPTION "Alfred - Asistente IA local en C++ con HuggingFace + CUDA"
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Forzar API minima de Windows 10 para dependencias (ej. cpp-httplib)
# y evitar defaults antiguos en MinGW.
if(WIN32)
    add_compile_definitions(
        WINVER=0x0A00
        _WIN32_WINNT=0x0A00
        NTDDI_VERSION=0x0A000000
    )
endif()

# Build type por defecto: Release (aplica a generadores de config unica como Ninja/Make)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Tipo de build (Debug, Release, RelWithDebInfo, MinSizeRel)" FORCE)
    message(STATUS "CMAKE_BUILD_TYPE no especificado, usando Release por defecto")
endif()

# ============================================================================
# Opciones de compilacion
# ============================================================================
option(ALFRED_CUDA        "Habilitar soporte CUDA para inferencia LLM"  ON)
# Arquitecturas CUDA objetivo: 75=Turing (RTX 20xx), 86=Ampere (RTX 30xx/A-series), 89=Ada (RTX 40xx)
# Para compilar solo para la GPU local, usar: -DALFRED_CUDA_ARCH=native
set(ALFRED_CUDA_ARCH "75;86;89" CACHE STRING "Arquitecturas CUDA objetivo para distribucion")

# Habilitar lenguaje CUDA si esta solicitado y disponible
if(ALFRED_CUDA)
    # Usar cudart dinamico para que el runtime CUDA que requiere el ejecutable
    # se pueda distribuir de forma explicita junto con la aplicacion.
    set(CMAKE_CUDA_RUNTIME_LIBRARY Shared)
    include(CheckLanguage)
    check_language(CUDA)
    if(CMAKE_CUDA_COMPILER)
        enable_language(CUDA)
        # Mantener compilador, headers y librerias en el mismo toolkit cuando
        # hay varias versiones de CUDA instaladas en la maquina.
        get_filename_component(ALFRED_CUDA_BIN_DIR
            "${CMAKE_CUDA_COMPILER}" DIRECTORY)
        get_filename_component(ALFRED_CUDA_TOOLKIT_ROOT
            "${ALFRED_CUDA_BIN_DIR}" DIRECTORY)
        set(CUDAToolkit_ROOT "${ALFRED_CUDA_TOOLKIT_ROOT}"
            CACHE PATH "CUDA toolkit matching CMAKE_CUDA_COMPILER" FORCE)
        message(STATUS "CUDA habilitado: ${CMAKE_CUDA_COMPILER}")
    else()
        message(WARNING "CUDA solicitado pero no se encontro compilador CUDA. Deshabilitando CUDA.")
        set(ALFRED_CUDA OFF)
    endif()
endif()

# ============================================================================
# Dependencias externas via FetchContent
# ============================================================================
include(FetchContent)
set(FETCHCONTENT_QUIET OFF)

# --- llama.cpp (inferencia LLM + embeddings con CUDA nativo) ---
# Reemplaza Ollama: carga modelos GGUF de HuggingFace directamente
set(GGML_CUDA ${ALFRED_CUDA} CACHE BOOL "CUDA en ggml backend" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# Arquitecturas CUDA configurables para distribucion multiplataforma
if(ALFRED_CUDA)
    set(CMAKE_CUDA_ARCHITECTURES ${ALFRED_CUDA_ARCH} CACHE STRING "CUDA architectures" FORCE)
    message(STATUS "CUDA architectures: ${CMAKE_CUDA_ARCHITECTURES}")
endif()

FetchContent_Declare(llama_cpp
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG        b8912
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(llama_cpp)

# Fix: llama.cpp usa u8"" literales que en C++20 MSVC son char8_t incompatible
# con const char*. Desactivamos char8_t para targets de llama.cpp.
if(MSVC)
    if(TARGET llama)
        target_compile_options(llama PRIVATE /Zc:char8_t-)
    endif()
    if(TARGET ggml)
        target_compile_options(ggml PRIVATE /Zc:char8_t-)
    endif()
endif()
set(HTTPLIB_REQUIRE_OPENSSL OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_NON_BLOCKING_GETADDRINFO OFF CACHE BOOL "" FORCE)
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib
    GIT_TAG        v0.43.1
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(httplib)

# --- nlohmann/json (parsing JSON para API REST) ---
set(JSON_BuildTests OFF CACHE BOOL "" FORCE)
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json
    GIT_TAG        v3.12.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(json)

# --- spdlog (logging estructurado) ---
FetchContent_Declare(spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog
    GIT_TAG        v1.17.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(spdlog)

# --- SQLiteCpp (wrapper SQLite para C++) ---
set(SQLITECPP_RUN_CPPLINT OFF CACHE BOOL "" FORCE)
set(SQLITECPP_RUN_CPPCHECK OFF CACHE BOOL "" FORCE)
FetchContent_Declare(SQLiteCpp
    GIT_REPOSITORY https://github.com/SRombauts/SQLiteCpp
    GIT_TAG        3.3.3
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(SQLiteCpp)

# --- PDFium (extraccion de texto desde PDFs) ---
# Usamos los binarios prebuilt de bblanchon/pdfium-binaries. Son libres
# (Apache 2.0 / BSD-3) e incluyen cabeceras listas para usar. Descarga
# automatica por FetchContent: no requiere vcpkg.
if(WIN32)
    set(PDFIUM_URL "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F7802/pdfium-win-x64.tgz")
elseif(APPLE)
    set(PDFIUM_URL "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F7802/pdfium-mac-x64.tgz")
else()
    set(PDFIUM_URL "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F7802/pdfium-linux-x64.tgz")
endif()

FetchContent_Declare(pdfium
    URL            ${PDFIUM_URL}
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(pdfium)

# El paquete descomprime en <pdfium_SOURCE_DIR>/{include,lib,bin}
set(PDFIUM_INCLUDE_DIR "${pdfium_SOURCE_DIR}/include")
if(WIN32)
    set(PDFIUM_LIBRARY "${pdfium_SOURCE_DIR}/lib/pdfium.dll.lib")
    set(PDFIUM_RUNTIME "${pdfium_SOURCE_DIR}/bin/pdfium.dll")
elseif(APPLE)
    set(PDFIUM_LIBRARY "${pdfium_SOURCE_DIR}/lib/libpdfium.dylib")
    set(PDFIUM_RUNTIME "${PDFIUM_LIBRARY}")
else()
    set(PDFIUM_LIBRARY "${pdfium_SOURCE_DIR}/lib/libpdfium.so")
    set(PDFIUM_RUNTIME "${PDFIUM_LIBRARY}")
endif()

add_library(pdfium SHARED IMPORTED)
set_target_properties(pdfium PROPERTIES
    IMPORTED_LOCATION "${PDFIUM_RUNTIME}"
    IMPORTED_IMPLIB   "${PDFIUM_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${PDFIUM_INCLUDE_DIR}"
)

# --- OpenSSL (encriptacion AES-256-GCM, opcional) ---
find_package(OpenSSL QUIET)
if(NOT OpenSSL_FOUND)
    message(WARNING "OpenSSL no encontrado. Encriptacion AES-256-GCM deshabilitada.")
    add_compile_definitions(ALFRED_NO_OPENSSL)
endif()

# ============================================================================
# Ejecutable principal: Alfred
# ============================================================================
set(ALFRED_SOURCES
    src/app/config.cpp
    src/app/paths.cpp
    src/app/string_utils.cpp
    src/app/logger.cpp
    src/app/gpu_manager.cpp
    src/app/encryption.cpp
    src/app/db_manager.cpp
    src/app/llm_engine.cpp
    src/app/model_lifecycle.cpp
    src/app/alfred_core.cpp
    src/app/conversation_manager.cpp
    src/app/token_accountant.cpp
    src/app/tone.cpp
    src/app/pdf_extractor.cpp
    src/app/endpoints.cpp
    src/app/http_server.cpp
)

add_executable(alfred src/main.cpp ${ALFRED_SOURCES})

target_include_directories(alfred PRIVATE
    ${CMAKE_SOURCE_DIR}/include
)

# Los warnings estrictos pertenecen al codigo de Alfred. Aplicarlos
# globalmente tambien afectaba a llama.cpp/CUDA y generaba millones de lineas
# de warnings de terceros en cada build del action.
if(MSVC)
    target_compile_options(alfred PRIVATE
        $<$<COMPILE_LANGUAGE:CXX>:/W4>
        $<$<COMPILE_LANGUAGE:CXX>:/permissive->
        $<$<COMPILE_LANGUAGE:CXX>:/utf-8>
    )
else()
    target_compile_options(alfred PRIVATE
        -Wall -Wextra -Wpedantic -Wshadow -Wconversion
    )
endif()

target_link_libraries(alfred PRIVATE
    llama
    httplib::httplib
    nlohmann_json::nlohmann_json
    spdlog::spdlog
    SQLiteCpp
    pdfium
)

# cudadevrt es siempre una biblioteca estatica y declara LIBCMT incluso cuando
# todo el codigo host se compila con /MD. Ignorar esa directiva concreta evita
# mezclar el CRT estatico con MSVCRT; los proyectos generados conservan /MD.
if(MSVC AND ALFRED_CUDA)
    target_link_options(alfred PRIVATE /NODEFAULTLIB:LIBCMT)
endif()

# Copiar runtime de PDFium junto al ejecutable (Windows requiere el DLL al lado).
add_custom_command(TARGET alfred POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${PDFIUM_RUNTIME}"
            "$<TARGET_FILE_DIR:alfred>"
)

if(OpenSSL_FOUND)
    target_link_libraries(alfred PRIVATE OpenSSL::SSL OpenSSL::Crypto)
endif()

# Threads requerido por varios componentes
find_package(Threads REQUIRED)
target_link_libraries(alfred PRIVATE Threads::Threads)

# Defines accesibles desde el codigo de Alfred.
target_compile_definitions(alfred PRIVATE
    ALFRED_VERSION="${PROJECT_VERSION}"
    ALFRED_CUDA_ENABLED=$<BOOL:${ALFRED_CUDA}>
)

# Whole Program Optimization + Link-Time Code Generation en Release (MSVC)
# Las demas flags de Release/Debug las gestiona CMake automaticamente
if(MSVC)
    target_compile_options(alfred PRIVATE $<$<CONFIG:Release>:/GL>)
    target_link_options(alfred PRIVATE $<$<CONFIG:Release>:/LTCG>)
endif()

# Install target para distribucion y CI/CD
install(TARGETS alfred
    RUNTIME DESTINATION bin
    COMPONENT Runtime
)

# El runtime de PDFium (DLL en Windows, .so/.dylib en otros) debe acompanar al binario.
install(FILES "${PDFIUM_RUNTIME}"
    DESTINATION bin
    COMPONENT Runtime
)
