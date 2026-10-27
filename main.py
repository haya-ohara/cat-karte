import os
from fastapi import FastAPI
from google import genai

app = FastAPI()

client = genai.Client()


@app.post("/api/chat")
async def chat_with_gemini(data: dict):
  user_message = data.get("message")

  response = client.models.generate_content(
      model="gemini-3.8-flash", contents=user_message
  )
  return {"reply": response.text}
