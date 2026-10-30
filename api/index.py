import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from pydantic import BaseModel

template = "あなたは獣医師AIです。これから猫の病気の診断をしてもらいます。以下の飼い主からの相談をもとに質問内容を考え診断を行ってください。"


app = FastAPI()

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app.mount("/css", StaticFiles(directory=os.path.join(base_dir, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(base_dir, "js")), name="js")
app.mount("/data", StaticFiles(directory=os.path.join(base_dir, "data")), name="data")
app.mount("/img", StaticFiles(directory=os.path.join(base_dir, "img")), name="img")

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
        model="gemini-3.5-flash-lite",
        contents=template+user_message
    )
    return {"reply": response.text}
  except Exception as e:
    return {"reply": f"サーバーエラーが発生しました: {str(e)}"}
