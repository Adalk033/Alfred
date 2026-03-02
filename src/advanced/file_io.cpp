// ============================================================================
// file_io.cpp - Entrada/Salida de archivos en C++
// ============================================================================
// JS: fs.readFileSync(), fs.writeFileSync(), fs.promises.readFile()
// C++: std::ifstream (leer), std::ofstream (escribir), std::fstream (ambos)
//
// C++ tambien tiene <filesystem> (C++17) para manejar paths, directorios,
// permisos, etc. Similar a Node's path y fs modules.
// Para Alfred: cargar documentos, escribir logs, manejar base de datos.
// ============================================================================

#include <iostream>
#include <fstream>      // ifstream, ofstream, fstream
#include <sstream>      // stringstream (leer todo de golpe)
#include <string>
#include <vector>
#include <filesystem>   // C++17: paths, directorios, permisos
#include <chrono>
#include "utils.h"

namespace fs = std::filesystem;

int main() {
    alfred::print_separator("FILE I/O EN C++");

    // Directorio temporal para ejemplos
    const fs::path temp_dir = fs::temp_directory_path() / "alfred_cpp_demo";
    fs::create_directories(temp_dir);
    std::cout << "  Directorio de trabajo: " << temp_dir.string() << "\n\n";

    // -----------------------------------------------------------------
    // ESCRIBIR ARCHIVOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Escribir archivos (ofstream)",
        "ofstream = output file stream. Similar a fs.writeFileSync().");

    {
        // JS: fs.writeFileSync("config.json", JSON.stringify(data));
        fs::path config_path = temp_dir / "config.txt";
        std::ofstream archivo(config_path);

        if (!archivo.is_open()) {
            std::cerr << "  ERROR: No se pudo crear " << config_path << "\n";
            return 1;
        }

        // Escribir como cout pero a archivo
        archivo << "modelo=gemma2:9b\n";
        archivo << "temperatura=0.7\n";
        archivo << "max_tokens=4096\n";
        archivo << "gpu_enabled=true\n";
        archivo << "embedding_model=all-MiniLM-L6-v2\n";

        archivo.close();  // Opcional: se cierra al salir del scope (RAII)
        std::cout << "  Escrito: " << config_path.filename().string() << "\n";
    }

    // -----------------------------------------------------------------
    // LEER ARCHIVOS
    // -----------------------------------------------------------------
    alfred::print_lesson("Leer archivos (ifstream)",
        "ifstream = input file stream. Similar a fs.readFileSync().");

    {
        // METODO 1: Leer linea por linea
        // JS: const lines = fs.readFileSync(path, 'utf-8').split('\n');
        fs::path config_path = temp_dir / "config.txt";
        std::ifstream archivo(config_path);

        if (!archivo.is_open()) {
            std::cerr << "  ERROR: No se pudo abrir el archivo\n";
            return 1;
        }

        std::cout << "\n  --- Linea por linea ---\n";
        std::string linea;
        int num_linea = 0;
        while (std::getline(archivo, linea)) {
            ++num_linea;
            std::cout << "  " << num_linea << ": " << linea << "\n";
        }
        archivo.close();
    }

    {
        // METODO 2: Leer TODO el archivo de golpe
        // JS: const content = fs.readFileSync(path, 'utf-8');
        fs::path config_path = temp_dir / "config.txt";
        std::ifstream archivo(config_path);
        std::stringstream buffer;
        buffer << archivo.rdbuf();  // Vuelca todo al stringstream
        std::string contenido = buffer.str();
        archivo.close();

        std::cout << "\n  --- Todo el contenido (" << contenido.size() << " bytes) ---\n";
        std::cout << "  " << contenido.substr(0, 60) << "...\n";
    }

    // -----------------------------------------------------------------
    // ESCRIBIR DATOS ESTRUCTURADOS (simular JSON/CSV)
    // -----------------------------------------------------------------
    alfred::print_lesson("Datos estructurados",
        "Escribir registros con formato. Alfred usa esto para logs e historia.");

    {
        struct QARecord {
            std::string pregunta;
            std::string respuesta;
            double score;
        };

        std::vector<QARecord> historia = {
            {"Que es CUDA?", "API de NVIDIA para GPU computing", 0.95},
            {"Como funciona RAG?", "Retrieval Augmented Generation combina busqueda con LLM", 0.88},
            {"Que es un embedding?", "Vector numerico que representa semantica del texto", 0.92}
        };

        // Escribir CSV
        fs::path csv_path = temp_dir / "history.csv";
        std::ofstream csv(csv_path);
        csv << "pregunta;respuesta;score\n";  // Header
        for (const auto& record : historia) {
            csv << record.pregunta << ";" << record.respuesta << ";" << record.score << "\n";
        }
        csv.close();
        std::cout << "\n  Escrito CSV: " << csv_path.filename().string()
                  << " (" << historia.size() << " registros)\n";

        // Leer CSV
        std::ifstream csv_in(csv_path);
        std::string linea;
        std::getline(csv_in, linea);  // Saltar header
        std::cout << "  --- Leyendo CSV ---\n";
        while (std::getline(csv_in, linea)) {
            // Parsear por delimitador
            size_t pos1 = linea.find(';');
            size_t pos2 = linea.find(';', pos1 + 1);
            if (pos1 != std::string::npos && pos2 != std::string::npos) {
                std::string pregunta = linea.substr(0, pos1);
                std::string respuesta = linea.substr(pos1 + 1, pos2 - pos1 - 1);
                std::string score_str = linea.substr(pos2 + 1);
                std::cout << "  Q: " << pregunta << " [score: " << score_str << "]\n";
            }
        }
        csv_in.close();
    }

    // -----------------------------------------------------------------
    // APPEND MODE (agregar al final, como logs)
    // -----------------------------------------------------------------
    alfred::print_lesson("Modo append (logs)",
        "ios::app agrega al final sin borrar. Perfecto para logs.");

    {
        // JS: fs.appendFileSync('general.logs', mensaje);
        fs::path log_path = temp_dir / "general.logs";

        for (int i = 0; i < 3; ++i) {
            std::ofstream log(log_path, std::ios::app);
            auto ahora = std::chrono::system_clock::now();
            auto epoch = std::chrono::duration_cast<std::chrono::seconds>(
                ahora.time_since_epoch()).count();

            log << "[" << epoch << "] Evento " << i << ": operacion completada\n";
            log.close();
        }

        // Verificar contenido
        std::ifstream log_in(log_path);
        std::string linea;
        std::cout << "\n  --- Log file ---\n";
        while (std::getline(log_in, linea)) {
            std::cout << "  " << linea << "\n";
        }
    }

    // -----------------------------------------------------------------
    // std::filesystem (C++17) - Operaciones de directorio
    // -----------------------------------------------------------------
    alfred::print_lesson("std::filesystem (C++17)",
        "Manejo de paths, directorios, permisos. Como path + fs de Node.");

    {
        // Informacion de paths
        fs::path ruta = temp_dir / "documentos" / "proyecto" / "readme.md";
        std::cout << "\n  Ejemplo de path:\n";
        std::cout << "  Completo:    " << ruta.string() << "\n";
        std::cout << "  Directorio:  " << ruta.parent_path().string() << "\n";
        std::cout << "  Archivo:     " << ruta.filename().string() << "\n";
        std::cout << "  Sin ext:     " << ruta.stem().string() << "\n";
        std::cout << "  Extension:   " << ruta.extension().string() << "\n";

        // Crear directorios recursivamente (como mkdir -p)
        // JS: fs.mkdirSync(dir, { recursive: true });
        fs::path docs_dir = temp_dir / "documentos" / "subdir";
        fs::create_directories(docs_dir);
        std::cout << "\n  Creado directorio: " << docs_dir.string() << "\n";

        // Crear algunos archivos de prueba
        for (int i = 0; i < 3; ++i) {
            std::ofstream f(docs_dir / ("doc" + std::to_string(i) + ".txt"));
            f << "Contenido del documento " << i;
        }

        // Iterar directorio (como fs.readdirSync)
        std::cout << "\n  Contenido de " << docs_dir.filename().string() << "/:\n";
        for (const auto& entry : fs::directory_iterator(docs_dir)) {
            auto size = fs::file_size(entry.path());
            std::cout << "  " << (entry.is_directory() ? "[DIR] " : "[FIL] ")
                      << entry.path().filename().string()
                      << " (" << size << " bytes)\n";
        }

        // Iterar recursivamente (como glob **)
        std::cout << "\n  Todos los archivos (recursivo) en temp_dir:\n";
        int count = 0;
        for (const auto& entry : fs::recursive_directory_iterator(temp_dir)) {
            if (entry.is_regular_file()) {
                auto rel = fs::relative(entry.path(), temp_dir);
                std::cout << "  " << rel.string()
                          << " (" << fs::file_size(entry.path()) << " bytes)\n";
                ++count;
            }
        }
        std::cout << "  Total archivos: " << count << "\n";

        // Verificar existencia (como fs.existsSync)
        std::cout << "\n  temp_dir existe? " << std::boolalpha << fs::exists(temp_dir) << "\n";
        std::cout << "  Es directorio?   " << fs::is_directory(temp_dir) << "\n";
    }

    // -----------------------------------------------------------------
    // LIMPIAR
    // -----------------------------------------------------------------
    alfred::print_lesson("Limpieza",
        "Borramos los archivos temporales del demo.");

    {
        auto removed = fs::remove_all(temp_dir);
        std::cout << "\n  Eliminados " << removed << " archivos/directorios\n";
        std::cout << "  temp_dir existe? " << std::boolalpha << fs::exists(temp_dir) << "\n";
    }

    alfred::print_separator();
    std::cout << "  Leccion clave: C++ file I/O usa streams (ifstream/ofstream).\n";
    std::cout << "  RAII: los archivos se cierran automaticamente al salir del scope.\n";
    std::cout << "  std::filesystem (C++17) es tan potente como Node's fs + path.\n";
    std::cout << "  Para Alfred: cargar documentos, escribir logs, gestionar cache,\n";
    std::cout << "  y recorrer directorios para indexar archivos.\n";
    alfred::print_separator();

    return 0;
}
