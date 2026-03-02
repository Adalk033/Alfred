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
    return generate_key(key_path);
#endif
}

bool Encryption::generate_key(const std::string& key_path) {
#ifdef ALFRED_NO_OPENSSL
    (void)key_path;
    return false;
#else
    key_.resize(32); // 256 bits
    if (RAND_bytes(key_.data(), 32) != 1) {
        log_error("Error generando clave aleatoria");
        return false;
    }

    // Guardar en archivo
    std::ofstream file(key_path, std::ios::binary);
    if (!file.is_open()) {
        log_error("No se pudo guardar clave en: " + key_path);
        return false;
    }

    std::string encoded = to_base64(key_);
    file.write(encoded.c_str(), static_cast<std::streamsize>(encoded.size()));
    file.close();

    initialized_ = true;
    log_info("Nueva clave de encriptacion generada y guardada");
    return true;
#endif
}

bool Encryption::is_enabled() const { return enabled_ && initialized_; }
void Encryption::set_enabled(bool enabled) { enabled_ = enabled; }
bool Encryption::has_key() const { return initialized_ && !key_.empty(); }

void Encryption::set_key(const std::string& key_string) {
    // Derivar clave de 32 bytes desde el string proporcionado
    key_.resize(32, 0);
    for (size_t i = 0; i < key_string.size() && i < 32; ++i) {
        key_[i] = static_cast<unsigned char>(key_string[i]);
    }
    // Si la clave es mas corta, repetir para llenar
    if (key_string.size() < 32) {
        for (size_t i = key_string.size(); i < 32; ++i) {
            key_[i] = key_[i % key_string.size()];
        }
    }
    initialized_ = true;
}

std::string Encryption::get_key_display() const {
    if (!initialized_ || key_.empty()) return "";
    return to_base64(key_);
}

// ============================================================================
// AES-256-GCM encrypt/decrypt
// ============================================================================
std::vector<unsigned char> Encryption::aes_gcm_encrypt(
    const std::vector<unsigned char>& plaintext) const {
#ifdef ALFRED_NO_OPENSSL
    return plaintext;
#else
    // IV (12 bytes) + ciphertext + tag (16 bytes)
    std::vector<unsigned char> iv(12);
    RAND_bytes(iv.data(), 12);

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) return {};

    std::vector<unsigned char> result;
    result.insert(result.end(), iv.begin(), iv.end()); // Prepend IV

    EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, 12, nullptr);
    EVP_EncryptInit_ex(ctx, nullptr, nullptr, key_.data(), iv.data());

    std::vector<unsigned char> ciphertext(plaintext.size() + 16);
    int len = 0;
    EVP_EncryptUpdate(ctx, ciphertext.data(), &len,
                      plaintext.data(), static_cast<int>(plaintext.size()));
    int ciphertext_len = len;

    EVP_EncryptFinal_ex(ctx, ciphertext.data() + len, &len);
    ciphertext_len += len;

    // Get tag
    unsigned char tag[16];
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16, tag);
    EVP_CIPHER_CTX_free(ctx);

    result.insert(result.end(), ciphertext.begin(),
                  ciphertext.begin() + ciphertext_len);
    result.insert(result.end(), tag, tag + 16);

    return result;
#endif
}

std::vector<unsigned char> Encryption::aes_gcm_decrypt(
    const std::vector<unsigned char>& ciphertext) const {
#ifdef ALFRED_NO_OPENSSL
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

    EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, 12, nullptr);
    EVP_DecryptInit_ex(ctx, nullptr, nullptr, key_.data(), iv.data());

    std::vector<unsigned char> plaintext(data.size());
    int len = 0;
    EVP_DecryptUpdate(ctx, plaintext.data(), &len,
                      data.data(), static_cast<int>(data.size()));
    int plaintext_len = len;

    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16,
                         const_cast<unsigned char*>(tag.data()));

    int ret = EVP_DecryptFinal_ex(ctx, plaintext.data() + len, &len);
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
    if (!initialized_ || key_.empty()) return plaintext;

    std::vector<unsigned char> data(plaintext.begin(), plaintext.end());
    auto encrypted = aes_gcm_encrypt(data);
    return to_base64(encrypted);
}

std::string Encryption::decrypt(const std::string& ciphertext) const {
    if (!initialized_ || key_.empty()) return ciphertext;

    auto data = from_base64(ciphertext);
    if (data.empty()) return ciphertext;

    auto decrypted = aes_gcm_decrypt(data);
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
