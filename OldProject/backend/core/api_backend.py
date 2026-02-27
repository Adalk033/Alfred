# api_backend.py
from fastapi import FastAPI
from pydantic import BaseModel
import alfred as backend

# Crea la aplicación FastAPI
app = FastAPI()

# Carga el modelo una sola vez al iniciar
modelo_llm = backend.inicializar_modelo()

# Define la estructura de los datos de entrada
class RequestData(BaseModel):
    ruta_documento: str
    pregunta_usuario: str

# Define el "endpoint" o la URL que la UI llamará
@app.post("/procesar")
async def procesar_datos(data: RequestData):
    print(f"Recibida petición para procesar: {data.ruta_documento}")

    # Llama a tu función de procesamiento de siempre
    resultado = backend.procesar_documento(
        modelo_llm,
        data.ruta_documento,
        data.pregunta_usuario
    )
    # Devuelve el resultado en formato JSON
    return {"resultado": resultado}