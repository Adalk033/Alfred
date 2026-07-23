// ============================================================================
// encryption.cpp - Encriptacion AES-256-GCM con OpenSSL
// ============================================================================
// Si ALFRED_NO_OPENSSL esta definido, las funciones pasan datos sin encriptar.
// ============================================================================
#include "alfred/encryption.h"
#include "alfred/logger.h"

#include <fstream>
#include <sstream>
#include <cstring>
#include <random>
#include <algorithm>

#ifndef ALFRED_NO_OPENSSL
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/bio.h>
#include <openssl/buffer.h>
#endif

namespace alfred {

Encryption& Encryption::instance() {
    static Encryption enc;
    return enc;
}

// ============================================================================
// Base64 encode/decode
// ============================================================================
std::string Encryption::to_base64(const std::vector<unsigned char>& data) const {
#ifndef ALFRED_NO_OPENSSL
    BIO* bio = BIO_new(BIO_s_mem());
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);
    BIO_write(bio, data.data(), static_cast<int>(data.size()));
    BIO_flush(bio);

    BUF_MEM* buf;
    BIO_get_mem_ptr(bio, &buf);
    std::string result(buf->data, buf->length);
    BIO_free_all(bio);
    return result;
#else
    // Fallback simple base64
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string result;
    int val = 0, valb = -6;
    for (unsigned char c : data) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            result.push_back(table[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) result.push_back(table[((val << 8) >> (valb + 8)) & 0x3F]);
    while (result.size() % 4) result.push_back('=');
    return result;
#endif
}

std::vector<unsigned char> Encryption::from_base64(const std::string& encoded) const {
#ifndef ALFRED_NO_OPENSSL
    BIO* bio = BIO_new_mem_buf(encoded.data(), static_cast<int>(encoded.size()));
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);

    std::vector<unsigned char> result(encoded.size());
    int len = BIO_read(bio, result.data(), static_cast<int>(result.size()));
    BIO_free_all(bio);

    if (len > 0) result.resize(static_cast<size_t>(len));
    else result.clear();
    return result;
#else
    static const int lookup[] = {
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
        52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,
        10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,
        28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51
    };
    std::vector<unsigned char> result;
    int val = 0, valb = -8;
    for (char c : encoded) {
        if (c == '=' || c < 0 || c >= 128) break;
        int v = lookup[static_cast<int>(c)];
        if (v < 0) break;
        val = (val << 6) + v;
        valb += 6;
        if (valb >= 0) {
            result.push_back(static_cast<unsigned char>((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return result;
#endif
}

// ============================================================================
// Inicializacion y gestion de claves
// ============================================================================
bool Encryption::initialize(const std::string& key_path) {
    std::lock_guard<std::mutex> lock(state_mutex_);
    key_path_ = key_path;
#ifdef ALFRED_NO_OPENSSL
    log_warn("OpenSSL no disponible - encriptacion deshabilitada");
    initialized_ = true;
    enabled_ = false;
    return true;
#else
    // Intentar cargar clave existente
    std::ifstream file(key_path, std::ios::binary);
    if (file.is_open()) {
        std::string content((std::istreambuf_iterator<char>(file)),
                             std::istreambuf_iterator<char>());
        file.close();

        key_ = from_base64(content);
        if (key_.size() == 32) {
            initialized_ = true;
            log_info("Clave de encriptacion cargada exitosamente");
            return true;
        }
        log_warn("Clave existente invalida, generando nueva");
    }

    // Generar nueva clave si no existe
    return generate_key_locked(key_path);
#endif
}

bool Encryption::generate_key(const std::string& key_path) {
    std::lock_guard<std::mutex> lock(state_mutex_);
    return generate_key_locked(key_path);
}

bool Encryption::generate_key_locked(const std::string& key_path) {
#ifdef ALFRED_NO_OPENSSL
    (void)key_path;
    return false;
#else
    key_.resize(32); // 256 bits
    if (RAND_bytes(key_.data(), 32) != 1) {
        log_error("Error generando clave aleatoria");
        key_.clear();
        return false;
    }

    key_path_ = key_path;
    if (!persist_key_locked()) return false;

    initialized_ = true;
    log_info("Nueva clave de encriptacion generada y guardada");
    return true;
#endif
}

bool Encryption::persist_key_locked() const {
    if (key_path_.empty() || key_.empty()) return false;
    std::ofstream file(key_path_, std::ios::binary | std::ios::trunc);
    if (!file.is_open()) {
        log_error("No se pudo guardar clave en: " + key_path_);
        return false;
    }
    std::string encoded = to_base64(key_);
    file.write(encoded.c_str(), static_cast<std::streamsize>(encoded.size()));
    return file.good();
}

bool Encryption::is_enabled() const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    return enabled_ && initialized_;
}

void Encryption::set_enabled(bool enabled) {
    std::lock_guard<std::mutex> lock(state_mutex_);
    enabled_ = enabled;
}

bool Encryption::has_key() const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    return initialized_ && !key_.empty();
}

void Encryption::set_key(const std::string& key_string) {
    std::lock_guard<std::mutex> lock(state_mutex_);
#ifdef ALFRED_NO_OPENSSL
    // Sin OpenSSL no hay KDF disponible; derivacion trivial (la encriptacion
    // esta deshabilitada en este build de todas formas).
    key_.assign(32, 0);
    for (size_t i = 0; i < 32 && !key_string.empty(); ++i) {
        key_[i] = static_cast<unsigned char>(key_string[i % key_string.size()]);
    }
    initialized_ = true;
#else
    // Derivacion robusta: PBKDF2-HMAC-SHA256 con salt aleatoria. La clave
    // derivada se persiste (la salt no hace falta: no se re-deriva nunca).
    unsigned char salt[16];
    if (RAND_bytes(salt, sizeof(salt)) != 1) {
        log_error("Error generando salt para derivacion de clave");
        return;
    }

    std::vector<unsigned char> derived(32);
    if (PKCS5_PBKDF2_HMAC(key_string.c_str(), static_cast<int>(key_string.size()),
                          salt, sizeof(salt), 100000, EVP_sha256(),
                          32, derived.data()) != 1) {
        log_error("Error derivando clave con PBKDF2");
        return;
    }

    key_ = std::move(derived);
    initialized_ = true;
    if (!persist_key_locked()) {
        log_warn("Clave derivada activa solo en memoria (no se pudo persistir)");
    }
#endif
}

std::string Encryption::get_key_display() const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    if (!initialized_ || key_.empty()) return "";
    return to_base64(key_);
}

// ============================================================================
// AES-256-GCM encrypt/decrypt
// ============================================================================
std::vector<unsigned char> Encryption::aes_gcm_encrypt(
    const std::vector<unsigned char>& plaintext,
    const std::vector<unsigned char>& key) const {
#ifdef ALFRED_NO_OPENSSL
    (void)key;
    return plaintext;
#else
    // IV (12 bytes) + ciphertext + tag (16 bytes)
    std::vector<unsigned char> iv(12);
    if (RAND_bytes(iv.data(), 12) != 1) {
        log_error("Error generando IV aleatorio");
        return {};
    }

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) return {};

    std::vector<unsigned char> result;
    result.insert(result.end(), iv.begin(), iv.end()); // Prepend IV

    bool ok = EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1
           && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, 12, nullptr) == 1
           && EVP_EncryptInit_ex(ctx, nullptr, nullptr, key.data(), iv.data()) == 1;

    std::vector<unsigned char> ciphertext(plaintext.size() + 16);
    int len = 0;
    int ciphertext_len = 0;
    if (ok) {
        ok = EVP_EncryptUpdate(ctx, ciphertext.data(), &len,
                               plaintext.data(), static_cast<int>(plaintext.size())) == 1;
        ciphertext_len = len;
    }
    if (ok) {
        ok = EVP_EncryptFinal_ex(ctx, ciphertext.data() + len, &len) == 1;
        ciphertext_len += len;
    }

    unsigned char tag[16];
    if (ok) {
        ok = EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16, tag) == 1;
    }
    EVP_CIPHER_CTX_free(ctx);

    if (!ok) {
        log_error("Error encriptando con AES-256-GCM");
        return {};
    }

    result.insert(result.end(), ciphertext.begin(),
                  ciphertext.begin() + ciphertext_len);
    result.insert(result.end(), tag, tag + 16);

    return result;
#endif
}

std::vector<unsigned char> Encryption::aes_gcm_decrypt(
    const std::vector<unsigned char>& ciphertext,
    const std::vector<unsigned char>& key) const {
#ifdef ALFRED_NO_OPENSSL
    (void)key;
    return ciphertext;
#else
    if (ciphertext.size() < 28) return {}; // IV(12) + min_data(0) + tag(16)

    // Extract IV, ciphertext, tag
    std::vector<unsigned char> iv(ciphertext.begin(), ciphertext.begin() + 12);
    std::vector<unsigned char> data(ciphertext.begin() + 12,
                                     ciphertext.end() - 16);
    std::vector<unsigned char> tag(ciphertext.end() - 16, ciphertext.end());

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) return {};

    bool ok = EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1
           && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, 12, nullptr) == 1
           && EVP_DecryptInit_ex(ctx, nullptr, nullptr, key.data(), iv.data()) == 1;

    std::vector<unsigned char> plaintext(data.size());
    int len = 0;
    int plaintext_len = 0;
    if (ok) {
        ok = EVP_DecryptUpdate(ctx, plaintext.data(), &len,
                               data.data(), static_cast<int>(data.size())) == 1;
        plaintext_len = len;
    }
    if (ok) {
        ok = EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16,
                                 const_cast<unsigned char*>(tag.data())) == 1;
    }

    int ret = ok ? EVP_DecryptFinal_ex(ctx, plaintext.data() + len, &len) : 0;
    EVP_CIPHER_CTX_free(ctx);

    if (ret <= 0) {
        log_error("Error desencriptando: verificacion de tag fallida");
        return {};
    }

    plaintext_len += len;
    plaintext.resize(static_cast<size_t>(plaintext_len));
    return plaintext;
#endif
}

// ============================================================================
// API publica de encrypt/decrypt
// ============================================================================
std::string Encryption::encrypt(const std::string& plaintext) const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    if (!initialized_ || key_.empty()) return plaintext;

    std::vector<unsigned char> data(plaintext.begin(), plaintext.end());
    auto encrypted = aes_gcm_encrypt(data, key_);
    if (encrypted.empty() && !plaintext.empty()) return plaintext;
    return to_base64(encrypted);
}

std::string Encryption::decrypt(const std::string& ciphertext) const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    if (!initialized_ || key_.empty()) return ciphertext;

    auto data = from_base64(ciphertext);
    if (data.empty()) return ciphertext;

    auto decrypted = aes_gcm_decrypt(data, key_);
    if (decrypted.empty()) return ciphertext; // Retornar original si falla

    return std::string(decrypted.begin(), decrypted.end());
}

std::string Encryption::encrypt_if_enabled(const std::string& data) const {
    if (!is_enabled()) return data;
    return encrypt(data);
}

std::string Encryption::decrypt_if_enabled(const std::string& data) const {
    if (!is_enabled()) return data;
    return decrypt(data);
}

} // namespace alfred
