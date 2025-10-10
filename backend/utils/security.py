from cryptography.fernet import Fernet
from utils.paths import get_data_path
import os

KEY_FILE = get_data_path() / "secret.key"

def generate_key():
    if not KEY_FILE.exists():
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
    else:
        with open(KEY_FILE, "rb") as f:
            key = f.read()
    return key

def get_cipher():
    return Fernet(generate_key())

def encrypt_data(data: str) -> str:
    return get_cipher().encrypt(data.encode()).decode()

def decrypt_data(token: str) -> str:
    return get_cipher().decrypt(token.encode()).decode()
