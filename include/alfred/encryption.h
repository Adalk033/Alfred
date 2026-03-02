// ============================================================================
// encryption.h - Encriptacion AES-256-GCM
// ============================================================================
// Equivalente a: OldProject/backend/utils/security.py (parte de encriptacion)
// Reemplaza Fernet de Python con AES-256-GCM via OpenSSL.
// Si OpenSSL no esta disponible, las funciones retornan datos sin encriptar.
// ============================================================================
#pragma once

#include <string>
#include <optional>
#include <vector>

namespace alfred {

class Encryption {
public:
    static Encryption& instance();

    // Inicializar encriptacion con clave existente o generar nueva
    bool initialize(const std::string& key_path);

    // Generar nueva clave y guardarla en archivo
    bool generate_key(const std::string& key_path);

    // Estado
    bool is_enabled() const;
    void set_enabled(bool enabled);
    bool has_key() const;

    // Configurar clave desde string
    void set_key(const std::string& key_string);

    // Obtener clave para display (base64)
    std::string get_key_display() const;

    // Encriptar/desencriptar strings
    std::string encrypt(const std::string& plaintext) const;
    std::string decrypt(const std::string& ciphertext) const;

    // Encriptar/desencriptar si esta habilitado, sino retorna tal cual
    std::string encrypt_if_enabled(const std::string& data) const;
    std::string decrypt_if_enabled(const std::string& data) const;

private:
    Encryption() = default;

    std::vector<unsigned char> key_;
    bool enabled_ = true;
    bool initialized_ = false;

    // Helpers internos
    std::vector<unsigned char> aes_gcm_encrypt(const std::vector<unsigned char>& plaintext) const;
    std::vector<unsigned char> aes_gcm_decrypt(const std::vector<unsigned char>& ciphertext) const;
    std::string to_base64(const std::vector<unsigned char>& data) const;
    std::vector<unsigned char> from_base64(const std::string& encoded) const;
};

} // namespace alfred
