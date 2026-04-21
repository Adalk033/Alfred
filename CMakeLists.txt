cmake_minimum_required(VERSION 3.20)
project(AlfredCpp
    VERSION 0.3.0
    LANGUAGES CXX
    DESCRIPTION "Alfred - Asistente IA local en C++ con HuggingFace + CUDA"
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type por defecto: Release (aplica a generadores de config unica como Ninja/Make)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Tipo de build (Debug, Release, RelWithDebInfo, MinSizeRel)" FORCE)
    message(STATUS "CMAKE_BUILD_TYPE no especificado, usando Release por defecto")
endif()

# ============================================================================
# Opciones de compilacion
# ============================================================================
option(ALFRED_CUDA        "Habilitar soporte CUDA para inferencia LLM"  ON)
option(ALFRED_BUILD_LEARN "Compilar modulos de aprendizaje C++"         OFF)
# Arquitecturas CUDA objetivo: 75=Turing (RTX 20xx), 86=Ampere (RTX 30xx/A-series), 89=Ada (RTX 40xx)
# Para compilar solo para la GPU local, usar: -DALFRED_CUDA_ARCH=native
set(ALFRED_CUDA_ARCH "75;86;89" CACHE STRING "Arquitecturas CUDA objetivo para distribucion")

# Habilitar lenguaje CUDA si esta solicitado y disponible
if(ALFRED_CUDA)
    include(CheckLanguage)
    check_language(CUDA)
    if(CMAKE_CUDA_COMPILER)
        enable_language(CUDA)
        message(STATUS "CUDA habilitado: ${CMAKE_CUDA_COMPILER}")
    else()
        message(WARNING "CUDA solicitado pero no se encontro compilador CUDA. Deshabilitando CUDA.")
        set(ALFRED_CUDA OFF)
    endif()
endif()

if(MSVC)
    # Usar generator expressions para no pasar flags MSVC a nvcc (CUDA)
    add_compile_options(
        $<$<COMPILE_LANGUAGE:CXX>:/W4>
        $<$<COMPILE_LANGUAGE:CXX>:/permissive->
        $<$<COMPILE_LANGUAGE:CXX>:/utf-8>
    )
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion)
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
    GIT_TAG        b8860
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
    src/app/conversation_manager.cpp
    src/app/history_manager.cpp
    src/app/llm_engine.cpp
    src/app/model_lifecycle.cpp
    src/app/alfred_core.cpp
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

target_link_libraries(alfred PRIVATE
    llama
    httplib::httplib
    nlohmann_json::nlohmann_json
    spdlog::spdlog
    SQLiteCpp
    pdfium
)

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

# Version como define del compilador (accesible via ALFRED_VERSION en el codigo)
target_compile_definitions(alfred PRIVATE ALFRED_VERSION="${PROJECT_VERSION}")

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

# ============================================================================
# Modulos de aprendizaje (opcionales, para estudio de C++)
# ============================================================================
if(ALFRED_BUILD_LEARN)
    include_directories(${CMAKE_SOURCE_DIR}/include)

    # Basicos
    add_executable(learn_variables src/basics/variables.cpp)
    add_executable(learn_control_flow src/basics/control_flow.cpp)
    add_executable(learn_functions src/basics/functions.cpp)
    add_executable(learn_arrays src/basics/arrays.cpp)

    # POO
    add_executable(learn_classes src/oop/classes.cpp)
    add_executable(learn_inheritance src/oop/inheritance.cpp)
    add_executable(learn_polymorphism src/oop/polymorphism.cpp)
    add_executable(learn_encapsulation src/oop/encapsulation.cpp)

    # Memoria
    add_executable(learn_pointers src/memory/pointers.cpp)
    add_executable(learn_references src/memory/references.cpp)
    add_executable(learn_smart_pointers src/memory/smart_pointers.cpp)
    add_executable(learn_dynamic_allocation src/memory/dynamic_allocation.cpp)

    # STL
    add_executable(learn_vectors src/stl/vectors.cpp)
    add_executable(learn_maps src/stl/maps.cpp)
    add_executable(learn_iterators src/stl/iterators.cpp)
    add_executable(learn_algorithms src/stl/algorithms.cpp)

    # Templates
    add_executable(learn_function_templates src/templates/function_templates.cpp)
    add_executable(learn_class_templates src/templates/class_templates.cpp)

    # Avanzado
    add_executable(learn_move_semantics src/advanced/move_semantics.cpp)
    add_executable(learn_lambdas src/advanced/lambdas.cpp)
    add_executable(learn_concurrency src/advanced/concurrency.cpp)
    add_executable(learn_file_io src/advanced/file_io.cpp)

    # Tests
    add_executable(run_tests tests/test_basics.cpp)
endif()
