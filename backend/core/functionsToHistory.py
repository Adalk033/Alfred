from datetime import datetime
import os
import json
import re
from utils.security import encrypt_data, decrypt_data
from db_manager import (
    insert_qa_history, 
    get_qa_history as db_get_qa_history,
    delete_qa_history as db_delete_qa_history
)

# Stopwords en español (palabras comunes sin significado relevante)
SPANISH_STOPWORDS = {
    'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'haber',
    'por', 'con', 'su', 'para', 'como', 'estar', 'tener', 'le', 'lo', 'todo',
    'pero', 'más', 'hacer', 'o', 'poder', 'decir', 'este', 'ir', 'otro', 'ese',
    'si', 'me', 'ya', 'ver', 'porque', 'dar', 'cuando', 'él', 'muy', 'sin',
    'vez', 'mucho', 'saber', 'qué', 'sobre', 'mi', 'alguno', 'mismo', 'yo',
    'también', 'hasta', 'año', 'dos', 'querer', 'entre', 'así', 'primero',
    'desde', 'grande', 'eso', 'ni', 'nos', 'llegar', 'pasar', 'tiempo', 'ella',
    'sí', 'día', 'uno', 'bien', 'poco', 'deber', 'entonces', 'poner', 'cosa',
    'tanto', 'hombre', 'parecer', 'nuestro', 'tan', 'donde', 'ahora', 'parte',
    'después', 'vida', 'quedar', 'siempre', 'creer', 'hablar', 'llevar', 'dejar',
    'nada', 'cada', 'seguir', 'menos', 'nuevo', 'encontrar', 'algo', 'solo',
    'decir', 'necesitar', 'casa', 'llamar', 'venir', 'pensar', 'salir', 'volver',
    'tomar', 'conocer', 'vivir', 'sentir', 'tratar', 'mirar', 'contar', 'empezar',
    'esperar', 'buscar', 'existir', 'entrar', 'trabajar', 'escribir', 'perder',
    'producir', 'ocurrir', 'entender', 'pedir', 'recibir', 'recordar', 'terminar',
    'permitir', 'aparecer', 'conseguir', 'comenzar', 'servir', 'sacar', 'cual',
    'es', 'son', 'esta', 'estas', 'estos', 'este', 'fue', 'fueron', 'sea', 'seas',
    'tengo', 'tienes', 'tiene', 'tienen', 'tuyo', 'tuya', 'mi', 'mis', 'tu', 'tus',
    'cual', 'cuales', 'quien', 'quienes', 'donde', 'como', 'cuando', 'cuanto'
}

def extract_keywords(text, min_length=3):
    """
    Extrae keywords relevantes de un texto eliminando stopwords
    
    Args:
        text: Texto del cual extraer keywords
        min_length: Longitud mínima de palabras a considerar
    
    Returns:
        Set de keywords relevantes
    """
    text_lower = text.lower()
    # Extraer palabras alfanuméricas
    words = re.findall(r'\w+', text_lower)
    
    # Filtrar stopwords y palabras muy cortas
    keywords = {
        word for word in words 
        if word not in SPANISH_STOPWORDS and len(word) >= min_length
    }
    
    return keywords

# --- Funciones de cifrado para datos sensibles ---
def encrypt_personal_data(personal_data: dict) -> dict:
    """
    Cifra los datos personales sensibles
    
    Args:
        personal_data: Diccionario con datos personales
    
    Returns:
        Diccionario con datos cifrados
    """
    if not personal_data:
        return {}
    
    encrypted_data = {}
    for key, value in personal_data.items():
        if value and isinstance(value, str):
            try:
                encrypted_data[key] = encrypt_data(value)
            except Exception as e:
                print(f"Error al cifrar {key}: {e}")
                encrypted_data[key] = value  # Fallback sin cifrar
        else:
            encrypted_data[key] = value
    
    return encrypted_data

def decrypt_personal_data(encrypted_data: dict) -> dict:
    """
    Descifra los datos personales
    
    Args:
        encrypted_data: Diccionario con datos cifrados
    
    Returns:
        Diccionario con datos descifrados
    """
    if not encrypted_data:
        return {}
    
    decrypted_data = {}
    for key, value in encrypted_data.items():
        if value and isinstance(value, str):
            try:
                decrypted_data[key] = decrypt_data(value)
            except Exception as e:
                print(f"Error al descifrar {key}: {e}")
                decrypted_data[key] = value  # Fallback: devolver como esta
        else:
            decrypted_data[key] = value
    
    return decrypted_data

# --- Función para guardar Q&A verificadas ---
def save_qa_to_history(question, answer, personal_data=None, sources=None, QA_HISTORY_FILE='alfred_qa_history.json', encrypt_sensitive=True):
    """
    Guarda una pregunta y respuesta verificada en el historial (ahora usa SQLite)
    
    Args:
        question: Pregunta del usuario
        answer: Respuesta de Alfred
        personal_data: Datos personales extraidos
        sources: Fuentes utilizadas
        QA_HISTORY_FILE: (OBSOLETO) Se mantiene por compatibilidad pero ya no se usa
        encrypt_sensitive: Si True, cifra los datos personales
    
    Returns:
        True si se guardo exitosamente, False en caso contrario
    """
    try:
        timestamp = datetime.now().isoformat()
        row_id = insert_qa_history(
            timestamp=timestamp,
            question=question,
            answer=answer,
            personal_data=personal_data or {},
            sources=sources or [],
            verified=True,
            encrypt_sensitive=encrypt_sensitive
        )
        return row_id is not None
    except Exception as e:
        print(f"Error al guardar en historial SQLite: {e}")
        return False

def load_qa_history(QA_HISTORY_FILE='alfred_qa_history.json', decrypt_sensitive=True):
    """
    Carga el historial de Q&A desde SQLite
    
    Args:
        QA_HISTORY_FILE: (OBSOLETO) Se mantiene por compatibilidad pero ya no se usa
        decrypt_sensitive: Si True, descifra los datos personales
    
    Returns:
        Lista de entradas del historial
    """
    try:
        return db_get_qa_history(decrypt_sensitive=decrypt_sensitive)
    except Exception as e:
        print(f"Error al cargar historial desde SQLite: {e}")
        return []

def delete_qa_from_history(timestamp, QA_HISTORY_FILE='alfred_qa_history.json'):
    """
    Elimina una entrada del historial de Q&A por su timestamp (ahora usa SQLite)
    
    Args:
        timestamp: Timestamp ISO de la entrada a eliminar
        QA_HISTORY_FILE: (OBSOLETO) Se mantiene por compatibilidad pero ya no se usa
    
    Returns:
        True si se elimino exitosamente, False en caso contrario
    """
    try:
        return db_delete_qa_history(timestamp)
    except Exception as e:
        print(f"Error al eliminar del historial SQLite: {e}")
        return False

def search_in_qa_history(question, history=None, threshold=0.3, top_k=3):
    """
    Busca en el historial de Q&A respuestas similares a la pregunta actual.
    Usa búsqueda por keywords inteligente con stopwords y ponderación.
    
    Args:
        question: La pregunta del usuario
        history: Lista de entradas del historial (si None, se carga automáticamente)
        threshold: Umbral mínimo de similitud (0-1)
        top_k: Número máximo de resultados a devolver
    
    Returns:
        Lista de tuplas (score, entry) ordenadas por relevancia
    """
    if history is None:
        print("Cargando historial...")
        history = load_qa_history('alfred_qa_history.json')
    
    if not history:
        print("No se encontró historial.")
        return []
    
    # Extraer keywords de la pregunta del usuario
    question_keywords = extract_keywords(question, min_length=2)
    
    if not question_keywords:
        print("No se encontraron keywords relevantes en la pregunta.")
        return []
    
    # Palabras clave importantes (alta prioridad en búsqueda)
    high_priority_keywords = {
        'rfc', 'curp', 'nss', 'nombre', 'dirección', 'direccion', 
        'teléfono', 'telefono', 'celular', 'email', 'correo', 'edad', 'fecha',
        'nacimiento', 'domicilio', 'trabajo', 'empresa', 'salario', 'sueldo',
        'cuenta', 'banco', 'clabe', 'tarjeta', 'ine', 'pasaporte', 'licencia',
        'cedula', 'cédula', 'titulo', 'título', 'certificado', 'acta', 'comprobante'
    }
    
    # Palabras de consulta (indican que se está preguntando algo)
    query_words = {
        'cual', 'cuál', 'qué', 'que', 'dónde', 'donde', 'cómo', 'como',
        'cuándo', 'cuando', 'cuánto', 'cuanto', 'quién', 'quien'
    }
    
    results = []
    
    for entry in history:
        if not entry.get('verified', True):  # Solo considerar respuestas verificadas
            continue
        
        stored_question = entry['question']
        stored_keywords = extract_keywords(stored_question, min_length=2)
        
        # Encontrar keywords comunes (excluyendo palabras de consulta)
        question_content_keywords = question_keywords - query_words
        stored_content_keywords = stored_keywords - query_words
        
        common_keywords = question_content_keywords & stored_content_keywords
        
        if not common_keywords:
            continue
        
        # === CÁLCULO DE SCORE ===
        
        # 1. Score base: Jaccard similarity (keywords comunes / keywords totales)
        union_keywords = question_content_keywords | stored_content_keywords
        base_score = len(common_keywords) / len(union_keywords) if union_keywords else 0
        
        # 2. Bonus por keywords de alta prioridad
        high_priority_matches = common_keywords & high_priority_keywords
        priority_bonus = len(high_priority_matches) * 0.25
        
        # 3. Bonus por coincidencia exacta de keywords importantes
        exact_match_bonus = 0
        for keyword in high_priority_matches:
            if keyword in question.lower() and keyword in stored_question.lower():
                exact_match_bonus += 0.15
        
        # 4. Bonus si tiene datos personales extraídos
        personal_data_bonus = 0.1 if entry.get('personal_data') and len(entry['personal_data']) > 0 else 0
        
        # 5. Bonus por fuentes (indica respuesta bien documentada)
        sources_bonus = 0.05 if entry.get('sources') and len(entry['sources']) > 0 else 0
        
        # 6. Penalty si hay muchas keywords diferentes (menos específico)
        specificity_score = len(common_keywords) / max(len(question_content_keywords), 1)
        
        # Score final combinado
        final_score = (
            base_score * 0.4 +           # 40% Jaccard similarity
            priority_bonus +               # Bonus por keywords importantes
            exact_match_bonus +            # Bonus por coincidencias exactas
            personal_data_bonus +          # Bonus por datos personales
            sources_bonus +                # Bonus por fuentes
            specificity_score * 0.2        # 20% especificidad
        )
        
        # Normalizar score a rango 0-1
        final_score = min(final_score, 1.0)
        
        if final_score >= threshold:
            results.append((final_score, entry))
    
    # Ordenar por score descendente y devolver top_k
    results.sort(key=lambda x: x[0], reverse=True)
    
    # Debug: mostrar resultados encontrados
    if results:
        print(f"✓ Encontradas {len(results)} coincidencias en el historial")
        for score, entry in results[:top_k]:
            print(f"  - Score: {score:.2f} | Pregunta: {entry['question'][:50]}...")
    
    return results[:top_k]