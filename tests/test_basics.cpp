// ============================================================================
// test_basics.cpp - Tests basicos para validar el aprendizaje
// ============================================================================
// Los tests son fundamentales en C++. Aqui usamos assert() simple.
// En proyectos reales se usa Google Test, Catch2, o doctest.
//
// assert(condicion) - Si la condicion es false, el programa aborta.
// Es la forma mas basica de verificar que el codigo funciona.
// ============================================================================

#include <iostream>
#include <cassert>
#include <string>
#include <vector>
#include <algorithm>
#include <numeric>
#include <memory>
#include <cmath>
#include "utils.h"

// -----------------------------------------------------------------
// FUNCIONES A TESTEAR
// -----------------------------------------------------------------

// Test 1: Funcion basica
int sumar(int a, int b) {
    return a + b;
}

// Test 2: Paso por referencia
void llenar_vector(std::vector<int>& vec, int n) {
    vec.clear();
    for (int i = 1; i <= n; ++i) {
        vec.push_back(i);
    }
}

// Test 3: Template
template<typename T>
T maximo(T a, T b) {
    return (a > b) ? a : b;
}

// Test 4: Similitud coseno simplificada
double cosine_similarity(const std::vector<float>& a, const std::vector<float>& b) {
    if (a.size() != b.size() || a.empty()) return 0.0;
    double dot = 0.0, norm_a = 0.0, norm_b = 0.0;
    for (size_t i = 0; i < a.size(); ++i) {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    if (norm_a == 0.0 || norm_b == 0.0) return 0.0;
    return dot / (std::sqrt(norm_a) * std::sqrt(norm_b));
}

// Test 5: Clase simple
class Contador {
private:
    int valor_;
public:
    Contador() : valor_(0) {}
    explicit Contador(int initial) : valor_(initial) {}
    void incrementar() { ++valor_; }
    void decrementar() { --valor_; }
    int valor() const { return valor_; }
    void reset() { valor_ = 0; }
};

// -----------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------

void test_tipos_basicos() {
    alfred::print_example("test_tipos_basicos");

    int entero = 42;
    double decimal = 3.14;
    bool booleano = true;
    std::string texto = "Alfred";

    assert(entero == 42);
    assert(decimal > 3.0 && decimal < 4.0);
    assert(booleano == true);
    assert(texto == "Alfred");
    assert(texto.size() == 6);

    // const no se puede modificar
    const int MAX = 100;
    assert(MAX == 100);
    // MAX = 200;  // ERROR de compilacion

    std::cout << "  PASSED\n";
}

void test_funciones() {
    alfred::print_example("test_funciones");

    assert(sumar(2, 3) == 5);
    assert(sumar(-1, 1) == 0);
    assert(sumar(0, 0) == 0);

    // Templates
    assert(maximo(10, 20) == 20);
    assert(maximo(3.14, 2.71) == 3.14);
    assert(maximo(std::string("z"), std::string("a")) == "z");

    std::cout << "  PASSED\n";
}

void test_vectores() {
    alfred::print_example("test_vectores");

    std::vector<int> v;
    assert(v.empty());

    // Llenar por referencia
    llenar_vector(v, 5);
    assert(v.size() == 5);
    assert(v[0] == 1);
    assert(v[4] == 5);

    // STL algorithms
    int suma = std::accumulate(v.begin(), v.end(), 0);
    assert(suma == 15);  // 1+2+3+4+5

    auto it = std::find(v.begin(), v.end(), 3);
    assert(it != v.end());
    assert(*it == 3);

    // Sort descendente
    std::sort(v.begin(), v.end(), std::greater<int>());
    assert(v[0] == 5);
    assert(v[4] == 1);

    std::cout << "  PASSED\n";
}

void test_strings() {
    alfred::print_example("test_strings");

    std::string s = "Hola Alfred";
    assert(s.find("Alfred") != std::string::npos);
    assert(s.find("xyz") == std::string::npos);
    assert(s.substr(0, 4) == "Hola");
    assert(s.length() == 11);

    // Concatenacion
    std::string resultado = s + " C++";
    assert(resultado == "Hola Alfred C++");

    // Comparacion (no == referencia como en Java, compara contenido)
    std::string a = "test";
    std::string b = "test";
    assert(a == b);  // Compara contenido, no puntero

    std::cout << "  PASSED\n";
}

void test_smart_pointers() {
    alfred::print_example("test_smart_pointers");

    // unique_ptr
    auto ptr = std::make_unique<Contador>(10);
    assert(ptr->valor() == 10);
    ptr->incrementar();
    assert(ptr->valor() == 11);

    // No se puede copiar, solo mover
    auto ptr2 = std::move(ptr);
    assert(ptr2->valor() == 11);
    assert(ptr == nullptr);  // ptr ya no tiene ownership

    // shared_ptr
    auto shared1 = std::make_shared<Contador>(0);
    assert(shared1.use_count() == 1);
    {
        auto shared2 = shared1;
        assert(shared1.use_count() == 2);
        shared2->incrementar();
    }
    assert(shared1.use_count() == 1);
    assert(shared1->valor() == 1);  // Modificado por shared2

    std::cout << "  PASSED\n";
}

void test_cosine_similarity() {
    alfred::print_example("test_cosine_similarity");

    // Vectores identicos = similitud 1.0
    std::vector<float> a = {1.0f, 0.0f, 0.0f};
    std::vector<float> b = {1.0f, 0.0f, 0.0f};
    double sim = cosine_similarity(a, b);
    assert(std::abs(sim - 1.0) < 0.001);

    // Vectores ortogonales = similitud 0.0
    std::vector<float> c = {1.0f, 0.0f, 0.0f};
    std::vector<float> d = {0.0f, 1.0f, 0.0f};
    sim = cosine_similarity(c, d);
    assert(std::abs(sim - 0.0) < 0.001);

    // Vectores opuestos = similitud -1.0
    std::vector<float> e = {1.0f, 0.0f};
    std::vector<float> f = {-1.0f, 0.0f};
    sim = cosine_similarity(e, f);
    assert(std::abs(sim - (-1.0)) < 0.001);

    // Vectores vacios
    std::vector<float> vacio;
    sim = cosine_similarity(vacio, vacio);
    assert(sim == 0.0);

    std::cout << "  PASSED\n";
}

void test_lambdas() {
    alfred::print_example("test_lambdas");

    auto duplicar = [](int x) { return x * 2; };
    assert(duplicar(5) == 10);

    // Lambda con captura
    int factor = 3;
    auto multiplicar = [factor](int x) { return x * factor; };
    assert(multiplicar(4) == 12);

    // Lambda con STL
    std::vector<int> nums = {1, 2, 3, 4, 5};
    int count = static_cast<int>(std::count_if(nums.begin(), nums.end(),
        [](int x) { return x > 3; }));
    assert(count == 2);

    std::cout << "  PASSED\n";
}

void test_clase_contador() {
    alfred::print_example("test_clase_contador");

    Contador c;
    assert(c.valor() == 0);

    c.incrementar();
    c.incrementar();
    c.incrementar();
    assert(c.valor() == 3);

    c.decrementar();
    assert(c.valor() == 2);

    c.reset();
    assert(c.valor() == 0);

    // Constructor con valor inicial
    Contador c2(100);
    assert(c2.valor() == 100);

    std::cout << "  PASSED\n";
}

// -----------------------------------------------------------------
// MAIN - Ejecutar todos los tests
// -----------------------------------------------------------------
int main() {
    alfred::print_separator("TESTS BASICOS C++");
    std::cout << "  Ejecutando suite de tests...\n\n";

    int total = 0;
    int passed = 0;

    auto run_test = [&total, &passed](const char* nombre, void(*fn)()) {
        ++total;
        try {
            fn();
            ++passed;
        } catch (const std::exception& e) {
            std::cerr << "  FAILED: " << nombre << " - " << e.what() << "\n";
        } catch (...) {
            std::cerr << "  FAILED: " << nombre << " - Error desconocido\n";
        }
    };

    run_test("tipos_basicos", test_tipos_basicos);
    run_test("funciones", test_funciones);
    run_test("vectores", test_vectores);
    run_test("strings", test_strings);
    run_test("smart_pointers", test_smart_pointers);
    run_test("cosine_similarity", test_cosine_similarity);
    run_test("lambdas", test_lambdas);
    run_test("clase_contador", test_clase_contador);

    alfred::print_separator();
    std::cout << "  Resultado: " << passed << "/" << total << " tests pasaron.\n";
    if (passed == total) {
        std::cout << "  Todos los tests pasaron correctamente!\n";
    } else {
        std::cout << "  ATENCION: " << (total - passed) << " tests fallaron.\n";
    }
    alfred::print_separator();

    return (passed == total) ? 0 : 1;
}
