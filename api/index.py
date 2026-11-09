import os
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
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

# トップページ
@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
  # 【修正】第1引数に request を渡す
  return templates.TemplateResponse(request, "index.html")

# 各種HTMLページを表示する部分
@app.get("/{page_name}.html", response_class=HTMLResponse)
async def serve_html_page(request: Request, page_name: str):
  file_path = os.path.join(base_dir, f"{page_name}.html")
  if os.path.exists(file_path):
    # 【修正】第1引数に request を渡す
    return templates.TemplateResponse(request, f"{page_name}.html")
  raise HTTPException(status_code=404, detail="Page not found")

# お問い合わせ送信完了ページ
@app.post("/contact_finished.html", response_class=HTMLResponse)
async def contact_submit(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    message: str = Form(...)
):
    # 【修正】第1引数に request を渡し、辞書には変数をそのまま入れる
    return templates.TemplateResponse(
        request,
        "contact_finished.html",
        {
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