import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from google import genai
from pydantic import BaseModel

app = FastAPI()

client = genai.Client()

class ChatRequest(BaseModel):
  message: str

@app.get("/")
async def read_index():
  return FileResponse("index.html")

@app.post("/api/chat")
async def chat_with_gemini(data: ChatRequest):
  user_message = data.message

  try:
    response = client.models.generate_content(
        model="gemini-1.5-flash", contents=user_message
    )
    return {"reply": response.text}
  except Exception as e:
    return {"reply": f"サーバーエラーが発生しました: {str(e)}"}