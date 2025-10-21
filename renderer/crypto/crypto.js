/**
 * crypto.js - Modulo de cifrado para viaje backend -> frontend
 * Implementa descifrado de datos enviados desde el backend
 * Compatible con cifrado Fernet del backend
 * 
 * IMPORTANTE: Fernet es un esquema de cifrado simetrico
 * La clave obtenida del backend es suficiente para descifrar
 */

class CryptoManager {
    constructor() {
        this.encryptionKey = null;
        this.isEnabled = false;
        this.fernetInstance = null;
    }

    /**
     * Inicializa el gestor de cifrado obteniendo la clave del backend
     */
    async initialize() {
        try {
            const result = await window.alfredAPI.getEncryptionKey();
            if (result.success && result.data?.key) {
                this.encryptionKey = result.data.key;
                this.isEnabled = result.data.enabled || true;
                
                // Cargar libreria Fernet si esta disponible
                await this._loadFernetLibrary();
                
                console.log('[CRYPTO] Gestor de cifrado inicializado');
                console.log('[CRYPTO] Algoritmo:', result.data.algorithm || 'Fernet');
                return true;
            } else {
                console.warn('[CRYPTO] No se pudo obtener clave de cifrado');
                this.isEnabled = false;
                return false;
            }
        } catch (error) {
            console.error('[CRYPTO] Error al inicializar:', error);
            this.isEnabled = false;
            return false;
        }
    }

    /**
     * Inicializa el descifrado via IPC (Main Process maneja Fernet)
     */
    async _loadFernetLibrary() {
        try {
            // Verificar que el IPC esta disponible
            if (window.alfredAPI?.decryptFernet) {
                console.log('[CRYPTO] Descifrado Fernet disponible via IPC');
                this.fernetInstance = true; // Flag para indicar que esta disponible
                return true;
            }
        } catch (error) {
            console.warn('[CRYPTO] No se pudo inicializar descifrado IPC:', error);
        }
        
        // Fallback: se usara descifrado basico (sin verificacion de MAC)
        console.log('[CRYPTO] Usando descifrado basico (sin Fernet)');
        return false;
    }

    /**
     * Descifra datos usando Fernet via IPC (Main Process)
     * Si Fernet no esta disponible, muestra warning pero permite continuar
     */
    async decrypt(encryptedData) {
        if (!encryptedData || !this.isEnabled || !this.encryptionKey) {
            return encryptedData;
        }

        try {
            // Si Fernet esta disponible via IPC
            if (this.fernetInstance && window.alfredAPI?.decryptFernet) {
                try {
                    const result = await window.alfredAPI.decryptFernet(encryptedData);
                    if (result.success) {
                        return result.data;
                    } else {
                        console.error('[CRYPTO] Error descifrado con Fernet:', result.error);
                    }
                } catch (error) {
                    console.error('[CRYPTO] Error en IPC decrypt:', error);
                    // Continuar con fallback
                }
            }

            // Fallback: Si es Fernet, los datos estan en base64
            // Intentar decodificar base64 y extraer el payload
            if (this.isFernetEncrypted(encryptedData)) {
                try {
                    // Fernet formato: Version (1) + Timestamp (8) + IV (16) + Ciphertext + HMAC (32)
                    // Por ahora, devolvemos una advertencia
                    console.warn('[CRYPTO] Descifrado completo requiere libreria Fernet.js. Devolviendo cifrado.');
                    return encryptedData;
                } catch (error) {
                    console.error('[CRYPTO] Error en fallback de descifrado:', error);
                    return encryptedData;
                }
            }

            return encryptedData;

        } catch (error) {
            console.error('[CRYPTO] Error inesperado al descifrar:', error);
            return encryptedData;
        }
    }

    /**
     * Descifra un objeto recursivamente, buscando campos que puedan estar cifrados
     */
    async decryptObject(obj) {
        if (!obj || !this.isEnabled) {
            return obj;
        }

        if (typeof obj === 'string') {
            // Intentar descifrar si parece ser Fernet
            if (this.isFernetEncrypted(obj)) {
                const decrypted = await this.decrypt(obj);
                if (decrypted !== obj) {
                    // Se descifro correctamente
                    return decrypted;
                }
            }
            return obj;
        }

        if (typeof obj === 'object') {
            if (Array.isArray(obj)) {
                const promises = obj.map(item => this.decryptObject(item));
                return await Promise.all(promises);
            }

            const decrypted = {};
            const entries = Object.entries(obj);
            
            for (const [key, value] of entries) {
                // Campos que deberían estar cifrados
                const sensibleFields = ['answer', 'personal_data', 'user_input', 'assistant_output', 'sources'];
                
                if (sensibleFields.includes(key)) {
                    if (typeof value === 'string' && this.isFernetEncrypted(value)) {
                        // Descifrar campo
                        try {
                            const decryptedValue = await this.decrypt(value);
                            // Si es JSON, parsear
                            if (typeof decryptedValue === 'string' && (decryptedValue.startsWith('{') || decryptedValue.startsWith('['))) {
                                try {
                                    decrypted[key] = JSON.parse(decryptedValue);
                                } catch {
                                    decrypted[key] = decryptedValue;
                                }
                            } else {
                                decrypted[key] = decryptedValue;
                            }
                        } catch (error) {
                            console.warn(`[CRYPTO] Error descifrando campo ${key}:`, error);
                            decrypted[key] = value;
                        }
                    } else if (typeof value === 'object' && value !== null) {
                        decrypted[key] = await this.decryptObject(value);
                    } else {
                        decrypted[key] = value;
                    }
                } else if (typeof value === 'object' && value !== null) {
                    decrypted[key] = await this.decryptObject(value);
                } else {
                    decrypted[key] = value;
                }
            }
            return decrypted;
        }

        return obj;
    }

    /**
     * Verifica si una cadena parece ser Fernet cifrado
     * Fernet comienza con gAAAAAB (base64 de version + timestamp)
     */
    isFernetEncrypted(str) {
        if (typeof str !== 'string') return false;
        return str.startsWith('gAAAAAB');
    }

    /**
     * Habilita/deshabilita el cifrado
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    /**
     * Obtiene el estado del cifrado
     */
    isEncryptionEnabled() {
        return this.isEnabled;
    }

    /**
     * Obtiene el estado del cifrado y disponibilidad de libreria
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            hasKey: !!this.encryptionKey,
            hasFernetLibrary: !!this.fernetInstance
        };
    }
}

// Singleton
let instance = null;

export function getCryptoManager() {
    if (!instance) {
        instance = new CryptoManager();
    }
    return instance;
}

export { CryptoManager };
