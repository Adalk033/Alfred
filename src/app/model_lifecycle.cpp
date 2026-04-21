// ============================================================================
// model_lifecycle.cpp
// ============================================================================
#include "alfred/model_lifecycle.h"

namespace alfred {

void ModelLifecycle::enter_processing() {
    std::lock_guard<std::mutex> lk(m_);
    in_flight_.fetch_add(1, std::memory_order_acq_rel);
    state_.store(ModelState::PROCESSING, std::memory_order_release);
    cv_.notify_all();
}

void ModelLifecycle::exit_processing() {
    std::lock_guard<std::mutex> lk(m_);
    int remaining = in_flight_.fetch_sub(1, std::memory_order_acq_rel) - 1;
    if (remaining <= 0) {
        in_flight_.store(0, std::memory_order_release);
        state_.store(ModelState::IDLE, std::memory_order_release);
        idle_since_ = std::chrono::steady_clock::now();
        cv_.notify_all();
    }
}

void ModelLifecycle::set_loading() {
    std::lock_guard<std::mutex> lk(m_);
    state_.store(ModelState::LOADING, std::memory_order_release);
    cv_.notify_all();
}

void ModelLifecycle::set_idle_now() {
    std::lock_guard<std::mutex> lk(m_);
    in_flight_.store(0, std::memory_order_release);
    state_.store(ModelState::IDLE, std::memory_order_release);
    idle_since_ = std::chrono::steady_clock::now();
    cv_.notify_all();
}

bool ModelLifecycle::can_unload(int timeout_sec) const {
    std::lock_guard<std::mutex> lk(m_);
    if (state_.load(std::memory_order_acquire) != ModelState::IDLE) return false;
    if (in_flight_.load(std::memory_order_acquire) != 0) return false;
    auto idle = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - idle_since_).count();
    return idle >= timeout_sec;
}

} // namespace alfred
