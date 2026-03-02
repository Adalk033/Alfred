cmake_minimum_required(VERSION 3.20)
project(AlfredCpp
    VERSION 0.2.0
    LANGUAGES CXX
    DESCRIPTION "Alfred - Asistente IA local en C++ con HuggingFace + CUDA"
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ============================================================================
# Opciones de compilacion
# ============================================================================
option(ALFRED_CUDA        "Habilitar soporte CUDA para inferencia LLM"  ON)
option(ALFRED_BUILD_LEARN "Compilar modulos de aprendizaje C++"         OFF)

if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8)
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

FetchContent_Declare(llama_cpp
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG        b8184
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(llama_cpp)

# --- cpp-httplib (servidor HTTP ligero, reemplaza FastAPI) ---
set(HTTPLIB_REQUIRE_OPENSSL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib
    GIT_TAG        v0.18.3
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(httplib)

# --- nlohmann/json (parsing JSON para API REST) ---
set(JSON_BuildTests OFF CACHE BOOL "" FORCE)
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json
    GIT_TAG        v3.11.3
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(json)

# --- spdlog (logging estructurado) ---
FetchContent_Declare(spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog
    GIT_TAG        v1.15.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(spdlog)

# --- hnswlib (busqueda vectorial, reemplaza ChromaDB) ---
FetchContent_Declare(hnswlib
    GIT_REPOSITORY https://github.com/nmslib/hnswlib
    GIT_TAG        v0.8.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(hnswlib)

# --- SQLiteCpp (wrapper SQLite para C++) ---
set(SQLITECPP_RUN_CPPLINT OFF CACHE BOOL "" FORCE)
set(SQLITECPP_RUN_CPPCHECK OFF CACHE BOOL "" FORCE)
FetchContent_Declare(SQLiteCpp
    GIT_REPOSITORY https://github.com/SRombauts/SQLiteCpp
    GIT_TAG        3.3.2
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(SQLiteCpp)

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
    src/app/path_validator.cpp
    src/app/db_manager.cpp
    src/app/conversation_manager.cpp
    src/app/history_manager.cpp
    src/app/llm_engine.cpp
    src/app/embedding_engine.cpp
    src/app/document_loader.cpp
    src/app/chunking.cpp
    src/app/vector_store.cpp
    src/app/retriever.cpp
    src/app/alfred_core.cpp
    src/app/endpoints.cpp
    src/app/http_server.cpp
)

add_executable(alfred src/main.cpp ${ALFRED_SOURCES})

target_include_directories(alfred PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${hnswlib_SOURCE_DIR}
)

target_link_libraries(alfred PRIVATE
    llama
    httplib::httplib
    nlohmann_json::nlohmann_json
    spdlog::spdlog
    SQLiteCpp
)

if(OpenSSL_FOUND)
    target_link_libraries(alfred PRIVATE OpenSSL::SSL OpenSSL::Crypto)
endif()

# Threads requerido por varios componentes
find_package(Threads REQUIRED)
target_link_libraries(alfred PRIVATE Threads::Threads)

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
