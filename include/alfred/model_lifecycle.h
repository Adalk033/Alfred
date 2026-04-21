// ============================================================================
// model_lifecycle.h - Estado y ciclo de vida del modelo LLM
// ============================================================================
// Maquina de estados que garantiza que unload_model() NUNCA se ejecute
// durante una inferencia en curso. El temporizador de inactividad solo
// arranca cuando todas las requests han terminado.
// ============================================================================
#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>

namespace alfred {

enum class ModelState {
    IDLE,
    LOADING,
    PROCESSING,
};

class ModelLifecycle {
public:
    // RAII scope: marca PROCESSING al entrar, decrementa al salir.
    // Mientras existan Scopes vivos, el monitor de inactividad no descargara.
    class Scope {
    public:
        explicit Scope(ModelLifecycle& lc) : lc_(&lc) { lc_->enter_processing(); }
        ~Scope() { if (lc_) lc_->exit_processing(); }
        Scope(const Scope&) = delete;
        Scope& operator=(const Scope&) = delete;
        Scope(Scope&& o) noexcept : lc_(o.lc_) { o.lc_ = nullptr; }
        Scope& operator=(Scope&&) = delete;
    private:
        ModelLifecycle* lc_;
    };

    ModelState state() const { return state_.load(std::memory_order_acquire); }
    int in_flight() const { return in_flight_.load(std::memory_order_acquire); }

    // Transiciones explicitas (para LOADING durante load_model/change_model).
    void set_loading();
    void set_idle_now();   // fuerza IDLE y reinicia contador de inactividad

    // Decide si el monitor puede descargar: requiere state == IDLE, sin requests
    // en vuelo y haber acumulado al menos timeout_sec de inactividad real.
    bool can_unload(int timeout_sec) const;

    // El hilo monitor duerme aqui; despierta por timeout o por cualquier
    // transicion (enter/exit/set_loading/set_idle_now).
    template <typename StopPredicate>
    void wait_for(std::chrono::seconds s, StopPredicate stop) {
        std::unique_lock<std::mutex> lk(m_);
        cv_.wait_for(lk, s, stop);
    }

    void notify() {
        std::lock_guard<std::mutex> lk(m_);
        cv_.notify_all();
    }

private:
    friend class Scope;

    void enter_processing();
    void exit_processing();

    mutable std::mutex m_;
    std::condition_variable cv_;
    std::atomic<ModelState> state_{ModelState::IDLE};
    std::atomic<int> in_flight_{0};
    std::chrono::steady_clock::time_point idle_since_{std::chrono::steady_clock::now()};
};

} // namespace alfred
