"""
User Learning Manager - Sistema de aprendizaje personalizado
Aprende patrones del usuario para respuestas mas personalizadas
No siempre activo: se ejecuta cada 7 dias o bajo demanda
"""

import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from collections import Counter
import json

from db_manager import get_connection, get_user_setting, set_user_setting
from utils.logger import get_logger

learning_logger = get_logger("user_learning")


class UserLearningManager:
    """
    Gestor del sistema de aprendizaje personalizado
    
    Modos de aprendizaje:
    - Ligero (light): Solo extrae patrones estadisticos, rapido, no usa GPU
    - Pesado (heavy): Analisis mas profundo con embeddings, usa mas recursos
    """
    
    def __init__(self):
        self.is_training = False
        self.last_learning_date = None
        self.current_mode = None
        self.progress = 0
        self.status_message = ""
        
    async def should_learn(self) -> bool:
        """
        Determinar si es momento de aprender automaticamente
        
        Returns:
            True si han pasado 7 dias desde ultimo aprendizaje 
            o hay mas de 50 conversaciones nuevas
        """
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Verificar cuando fue el ultimo aprendizaje
            cursor.execute("""
                SELECT setting_value FROM user_settings 
                WHERE setting_key = 'last_learning_date'
            """)
            result = cursor.fetchone()
            
            if not result or not result[0]:
                return True  # Primera vez
            
            try:
                last_date = datetime.fromisoformat(result[0])
            except:
                return True
            
            days_since = (datetime.now() - last_date).days
            
            # Contar mensajes nuevos desde ultimo aprendizaje
            cursor.execute("""
                SELECT COUNT(*) FROM conversation_messages 
                WHERE timestamp > ?
            """, (last_date.isoformat(),))
            result = cursor.fetchone()
            new_messages = result[0] if result else 0
            
            # Aprender cada 7 dias O si hay mas de 50 conversaciones nuevas
            return days_since >= 7 or new_messages >= 50
            
        except Exception as e:
            learning_logger.error(f"Error verificando si debe aprender: {e}")
            return False
        finally:
            conn.close()
    
    async def extract_user_patterns(self, deep_analysis: bool = False) -> Dict[str, Any]:
        """
        Extraer patrones de las ultimas conversaciones
        
        Args:
            deep_analysis: Si True, hace analisis mas profundo (modo pesado)
        
        Returns:
            Diccionario con patrones detectados
        """
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Obtener ultimas conversaciones
            limit = 200 if deep_analysis else 100
            
            cursor.execute("""
                SELECT cm.role, cm.content, cm.timestamp 
                FROM conversation_messages cm
                JOIN conversation_threads ct ON cm.conversation_id = ct.id
                ORDER BY cm.timestamp DESC
                LIMIT ?
            """, (limit,))
            
            messages = cursor.fetchall()
            
            if not messages:
                learning_logger.info("No hay conversaciones para analizar")
                return {}
            
            patterns = {
                'avg_response_length_preference': 0,
                'common_topics': [],
                'tone_preference': 'neutral',
                'time_patterns': {},
                'question_types': {},
                'vocabulary_level': 'standard',
                'detail_preference': 'medium',
                'learned_at': datetime.now().isoformat(),
                'mode_used': 'heavy' if deep_analysis else 'light',
                'conversations_analyzed': len(messages)
            }
            
            user_messages = []
            assistant_messages = []
            
            for msg in messages:
                role = msg[0]
                content = msg[1] if msg[1] else ""
                timestamp = msg[2]
                
                if role == 'user':
                    user_messages.append({'content': content, 'timestamp': timestamp})
                elif role == 'assistant':
                    assistant_messages.append({'content': content, 'timestamp': timestamp})
            
            # Analizar longitud preferida de respuestas
            if assistant_messages:
                lengths = [len(m['content']) for m in assistant_messages]
                avg_length = sum(lengths) / len(lengths)
                patterns['avg_response_length_preference'] = avg_length
                
                # Determinar preferencia de detalle
                if avg_length < 300:
                    patterns['detail_preference'] = 'concise'
                elif avg_length > 800:
                    patterns['detail_preference'] = 'detailed'
                else:
                    patterns['detail_preference'] = 'medium'
            
            # Analizar horarios de uso
            for msg in messages:
                try:
                    hour = datetime.fromisoformat(msg[2]).hour
                    if 6 <= hour < 12:
                        time_slot = 'manana'
                    elif 12 <= hour < 18:
                        time_slot = 'tarde'
                    elif 18 <= hour < 22:
                        time_slot = 'noche'
                    else:
                        time_slot = 'madrugada'
                    patterns['time_patterns'][time_slot] = patterns['time_patterns'].get(time_slot, 0) + 1
                except:
                    pass
            
            # Extraer keywords de mensajes del usuario
            all_keywords = []
            for msg in user_messages:
                keywords = self._extract_keywords(msg['content'])
                all_keywords.extend(keywords)
            
            # Top topics
            topic_counts = Counter(all_keywords)
            top_topics = topic_counts.most_common(15 if deep_analysis else 10)
            patterns['common_topics'] = [topic for topic, count in top_topics]
            
            # Analizar tipos de preguntas
            question_patterns = {
                'como': 0,
                'que': 0,
                'por_que': 0,
                'cuando': 0,
                'donde': 0,
                'cual': 0,
                'explicacion': 0,
                'ayuda': 0
            }
            
            for msg in user_messages:
                content_lower = msg['content'].lower()
                if 'como' in content_lower or 'cmo' in content_lower:
                    question_patterns['como'] += 1
                if 'que es' in content_lower or 'qu es' in content_lower:
                    question_patterns['que'] += 1
                if 'por que' in content_lower or 'por qu' in content_lower:
                    question_patterns['por_que'] += 1
                if 'explica' in content_lower or 'explicame' in content_lower:
                    question_patterns['explicacion'] += 1
                if 'ayuda' in content_lower or 'necesito' in content_lower:
                    question_patterns['ayuda'] += 1
            
            patterns['question_types'] = question_patterns
            
            # Determinar tono preferido basado en longitud y tipo de preguntas
            if question_patterns.get('explicacion', 0) > 5 or patterns['detail_preference'] == 'detailed':
                patterns['tone_preference'] = 'educational'
            elif question_patterns.get('ayuda', 0) > 5:
                patterns['tone_preference'] = 'supportive'
            elif patterns['detail_preference'] == 'concise':
                patterns['tone_preference'] = 'direct'
            else:
                patterns['tone_preference'] = 'balanced'
            
            # Analisis profundo (solo modo pesado)
            if deep_analysis:
                patterns = await self._deep_analysis(patterns, user_messages, assistant_messages)
            
            return patterns
            
        except Exception as e:
            learning_logger.error(f"Error extrayendo patrones: {e}")
            return {}
        finally:
            conn.close()
    
    def _extract_keywords(self, text: str, min_length: int = 3) -> List[str]:
        """
        Extrae keywords relevantes de un texto eliminando stopwords
        
        Args:
            text: Texto del cual extraer keywords
            min_length: Longitud minima de palabras a considerar
        
        Returns:
            Lista de keywords relevantes
        """
        import re
        
        # Stopwords en espanol
        stopwords = {
            'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'haber',
            'por', 'con', 'su', 'para', 'como', 'estar', 'tener', 'le', 'lo', 'todo',
            'pero', 'mas', 'hacer', 'o', 'poder', 'decir', 'este', 'ir', 'otro', 'ese',
            'si', 'me', 'ya', 'ver', 'porque', 'dar', 'cuando', 'el', 'muy', 'sin',
            'vez', 'mucho', 'saber', 'que', 'sobre', 'mi', 'alguno', 'mismo', 'yo',
            'tambien', 'hasta', 'ano', 'dos', 'querer', 'entre', 'asi', 'primero',
            'desde', 'grande', 'eso', 'ni', 'nos', 'llegar', 'pasar', 'tiempo', 'ella',
            'si', 'dia', 'uno', 'bien', 'poco', 'deber', 'entonces', 'poner', 'cosa',
            'tanto', 'hombre', 'parecer', 'nuestro', 'tan', 'donde', 'ahora', 'parte',
            'despues', 'vida', 'quedar', 'siempre', 'creer', 'hablar', 'llevar', 'dejar',
            'nada', 'cada', 'seguir', 'menos', 'nuevo', 'encontrar', 'algo', 'solo',
            'necesitar', 'casa', 'llamar', 'venir', 'pensar', 'salir', 'volver',
            'tomar', 'conocer', 'vivir', 'sentir', 'tratar', 'mirar', 'contar', 'empezar',
            'esperar', 'buscar', 'existir', 'entrar', 'trabajar', 'escribir', 'perder',
            'es', 'son', 'esta', 'estas', 'estos', 'fue', 'fueron', 'sea', 'seas',
            'tengo', 'tienes', 'tiene', 'tienen', 'tuyo', 'tuya', 'mis', 'tu', 'tus',
            'cual', 'cuales', 'quien', 'quienes', 'hola', 'gracias', 'favor', 'puedes',
            'podrias', 'quiero', 'quisiera', 'necesito', 'dame', 'dime', 'muestrame'
        }
        
        text_lower = text.lower()
        words = re.findall(r'\w+', text_lower)
        
        keywords = [
            word for word in words 
            if word not in stopwords and len(word) >= min_length and not word.isdigit()
        ]
        
        return keywords
    
    async def _deep_analysis(
        self, 
        patterns: Dict, 
        user_messages: List[Dict], 
        assistant_messages: List[Dict]
    ) -> Dict:
        """
        Analisis profundo adicional para modo pesado
        Usa embeddings si estan disponibles
        """
        try:
            self.status_message = "Realizando analisis profundo..."
            self.progress = 60
            
            # Analizar complejidad del vocabulario del usuario
            all_words = []
            for msg in user_messages:
                words = self._extract_keywords(msg['content'], min_length=4)
                all_words.extend(words)
            
            unique_words = set(all_words)
            vocabulary_richness = len(unique_words) / max(len(all_words), 1)
            
            if vocabulary_richness > 0.7:
                patterns['vocabulary_level'] = 'advanced'
            elif vocabulary_richness > 0.4:
                patterns['vocabulary_level'] = 'intermediate'
            else:
                patterns['vocabulary_level'] = 'basic'
            
            # Analizar patrones de seguimiento (si el usuario hace preguntas de seguimiento)
            followup_count = 0
            for msg in user_messages:
                content_lower = msg['content'].lower()
                if any(word in content_lower for word in ['entonces', 'y si', 'pero', 'ademas', 'tambien']):
                    followup_count += 1
            
            patterns['followup_tendency'] = 'high' if followup_count > len(user_messages) * 0.3 else 'normal'
            
            # Detectar preferencias de formato
            code_mentions = sum(1 for msg in user_messages if 'codigo' in msg['content'].lower() or 'code' in msg['content'].lower())
            list_mentions = sum(1 for msg in user_messages if 'lista' in msg['content'].lower() or 'pasos' in msg['content'].lower())
            
            if code_mentions > 3:
                patterns['format_preference'] = 'code_focused'
            elif list_mentions > 3:
                patterns['format_preference'] = 'structured'
            else:
                patterns['format_preference'] = 'narrative'
            
            self.progress = 80
            
            return patterns
            
        except Exception as e:
            learning_logger.error(f"Error en analisis profundo: {e}")
            return patterns
    
    def apply_learned_profile(self, base_prompt: str, patterns: Dict) -> str:
        """
        Aplicar el perfil aprendido al prompt
        Solo agrega contexto adicional, no modifica la estructura base
        
        Args:
            base_prompt: Prompt base a modificar
            patterns: Patrones aprendidos del usuario
        
        Returns:
            Prompt mejorado con contexto de aprendizaje
        """
        if not patterns:
            return base_prompt
        
        learning_context = "\n\nLEARNED USER PREFERENCES (personalize your response accordingly):\n"
        
        # Preferencia de detalle/longitud
        detail_pref = patterns.get('detail_preference', 'medium')
        if detail_pref == 'concise':
            learning_context += "- User prefers brief, to-the-point responses. Avoid unnecessary elaboration.\n"
        elif detail_pref == 'detailed':
            learning_context += "- User appreciates comprehensive, well-explained responses with examples.\n"
        else:
            learning_context += "- User prefers balanced responses with moderate detail.\n"
        
        # Tono preferido
        tone = patterns.get('tone_preference', 'balanced')
        tone_instructions = {
            'educational': "- User enjoys learning; include explanations and context.\n",
            'supportive': "- User values supportive, encouraging communication.\n",
            'direct': "- User prefers direct, efficient communication without preamble.\n",
            'balanced': "- Maintain a professional yet friendly tone.\n"
        }
        learning_context += tone_instructions.get(tone, "")
        
        # Topics de interes
        topics = patterns.get('common_topics', [])
        if topics:
            topics_str = ', '.join(topics[:5])
            learning_context += f"- User frequently discusses: {topics_str}. Connect responses to these interests when relevant.\n"
        
        # Nivel de vocabulario
        vocab_level = patterns.get('vocabulary_level', 'standard')
        if vocab_level == 'advanced':
            learning_context += "- User has advanced vocabulary; technical terms are appropriate.\n"
        elif vocab_level == 'basic':
            learning_context += "- Use simple, clear language. Avoid jargon.\n"
        
        # Preferencia de formato (solo en modo pesado)
        format_pref = patterns.get('format_preference')
        if format_pref == 'code_focused':
            learning_context += "- User often works with code; include code examples when helpful.\n"
        elif format_pref == 'structured':
            learning_context += "- User likes structured responses; use lists and clear organization.\n"
        
        # Patron de seguimiento
        followup = patterns.get('followup_tendency')
        if followup == 'high':
            learning_context += "- User often asks follow-up questions; anticipate related queries.\n"
        
        # Horario de uso mas frecuente
        time_patterns = patterns.get('time_patterns', {})
        if time_patterns:
            preferred_time = max(time_patterns, key=time_patterns.get)
            time_greetings = {
                'manana': "User is typically active in the morning.",
                'tarde': "User is typically active in the afternoon.",
                'noche': "User is typically active in the evening.",
                'madrugada': "User sometimes works late at night."
            }
            if preferred_time in time_greetings:
                learning_context += f"- {time_greetings[preferred_time]}\n"
        
        # Insertar antes del USER INPUT
        if "USER INPUT:" in base_prompt:
            enhanced_prompt = base_prompt.replace(
                "USER INPUT:",
                learning_context + "\nUSER INPUT:"
            )
        else:
            enhanced_prompt = base_prompt + learning_context
        
        return enhanced_prompt
    
    async def learn_from_conversations(self, mode: str = 'light') -> Dict[str, Any]:
        """
        Proceso principal de aprendizaje
        
        Args:
            mode: 'light' para aprendizaje rapido, 'heavy' para analisis profundo
        
        Returns:
            Resultado del aprendizaje
        """
        if self.is_training:
            return {
                'success': False,
                'message': 'Ya hay un proceso de aprendizaje en curso'
            }
        
        self.is_training = True
        self.current_mode = mode
        self.progress = 0
        self.status_message = "Iniciando aprendizaje..."
        
        try:
            learning_logger.info(f"Iniciando aprendizaje de patrones (modo: {mode})...")
            self.progress = 10
            
            # Verificar si hay suficientes conversaciones
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM conversation_messages")
            message_count = cursor.fetchone()[0]
            conn.close()
            
            if message_count < 10:
                self.is_training = False
                return {
                    'success': False,
                    'message': 'No hay suficientes conversaciones para aprender (minimo 10 mensajes)'
                }
            
            self.status_message = "Extrayendo patrones de conversaciones..."
            self.progress = 30
            
            # Extraer patrones
            deep_analysis = mode == 'heavy'
            patterns = await self.extract_user_patterns(deep_analysis=deep_analysis)
            
            if not patterns:
                self.is_training = False
                return {
                    'success': False,
                    'message': 'No se pudieron extraer patrones'
                }
            
            self.status_message = "Guardando patrones aprendidos..."
            self.progress = 90
            
            # Guardar patrones en BD
            set_user_setting('learned_user_patterns', json.dumps(patterns), 'json')
            set_user_setting('last_learning_date', datetime.now().isoformat(), 'string')
            set_user_setting('learning_mode_used', mode, 'string')
            
            self.progress = 100
            self.status_message = "Aprendizaje completado"
            
            learning_logger.info(
                f"Aprendizaje completado (modo: {mode}): "
                f"{len(patterns.get('common_topics', []))} topics, "
                f"preferencia de detalle: {patterns.get('detail_preference', 'unknown')}, "
                f"tono: {patterns.get('tone_preference', 'unknown')}"
            )
            
            return {
                'success': True,
                'message': f'Aprendizaje completado exitosamente (modo {mode})',
                'patterns': {
                    'topics_learned': len(patterns.get('common_topics', [])),
                    'conversations_analyzed': patterns.get('conversations_analyzed', 0),
                    'detail_preference': patterns.get('detail_preference'),
                    'tone_preference': patterns.get('tone_preference'),
                    'vocabulary_level': patterns.get('vocabulary_level'),
                    'mode_used': mode
                }
            }
            
        except Exception as e:
            learning_logger.error(f"Error en aprendizaje: {e}")
            return {
                'success': False,
                'message': f'Error durante el aprendizaje: {str(e)}'
            }
        finally:
            self.is_training = False
            self.current_mode = None
    
    def get_status(self) -> Dict[str, Any]:
        """Obtener estado actual del sistema de aprendizaje"""
        return {
            'is_training': self.is_training,
            'current_mode': self.current_mode,
            'progress': self.progress,
            'status_message': self.status_message
        }
    
    def get_learned_patterns(self) -> Dict[str, Any]:
        """Obtener patrones aprendidos guardados"""
        patterns_json = get_user_setting('learned_user_patterns', default='{}', setting_type='string')
        
        try:
            if isinstance(patterns_json, str):
                return json.loads(patterns_json)
            return patterns_json if patterns_json else {}
        except:
            return {}


# Instancia global
_learning_manager = None


def get_learning_manager() -> UserLearningManager:
    """Obtener instancia global del gestor de aprendizaje"""
    global _learning_manager
    if _learning_manager is None:
        _learning_manager = UserLearningManager()
    return _learning_manager
