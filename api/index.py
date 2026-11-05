import os
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from google import genai
from pydantic import BaseModel

template = "あなたは獣医師AIです。これから猫の病気の診断をしてもらいます。以下の飼い主からの相談をもとに質問内容を考え診断を行ってください。"


app = FastAPI()

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app.mount("/css", StaticFiles(directory=os.path.join(base_dir, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(base_dir, "js")), name="js")
app.mount("/data", StaticFiles(directory=os.path.join(base_dir, "data")), name="data")
app.mount("/img", StaticFiles(directory=os.path.join(base_dir, "img")), name="img")

templates = Jinja2Templates(directory=base_dir)

client = genai.Client()

class ChatRequest(BaseModel):
  message: str

@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
  return templates.TemplateResponse("index.html", {"request": request})

@app.get("/{page_name}.html")
async def serve_html_page(page_name: str):
  file_path = os.path.join(base_dir, f"{page_name}.html")
  if os.path.exists(file_path):
    return FileResponse(file_path)
  raise HTTPException(status_code=404, detail="Page not found")


@app.post("/contact.html", response_class=HTMLResponse)
async def contact_submit(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    message: str = Form(...)
):
    # 受け取ったデータを辞書型にして、HTMLに埋め込んで返す
    return templates.TemplateResponse(
        "contact_finished.html",
        {
            "request": request,
            "name": name,
            "email": email,
            "message": message
        }
    )

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
