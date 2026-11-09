import os
import json
from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from google import genai
from pydantic import BaseModel

app = FastAPI()

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app.mount("/css", StaticFiles(directory=os.path.join(base_dir, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(base_dir, "js")), name="js")
app.mount("/data", StaticFiles(directory=os.path.join(base_dir, "data")), name="data")
app.mount("/img", StaticFiles(directory=os.path.join(base_dir, "img")), name="img")

templates = Jinja2Templates(directory=base_dir)

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


# チャット機能

client = genai.Client()

class ChatRequest(BaseModel):
    message: str
    turn_count: int = 1 # 現在のやり取り回数

SYSTEM_PROMPT = """
あなたは優秀な獣医師AIです。
これから猫の病気の診断をしてもらいます。
飼い主からの相談メッセージをもとに、質問を重ねて病気を特定してください。

【ルール】
1. 現在のやり取り回数（turn_count）が10回に達した、または病気がほぼ断定できた場合は、診断を終了してください。
2. 診断が続いている場合（is_finished: false）：
   - 飼い主への返答文（reply）を作成してください。
   - 飼い主が次に選びそうな返信テンプレート（templates）を2〜3個（短い文章の配列、例：「食欲がない」「元気がない」など）提案してください。
   - result は null にしてください。
3. 診断が終了した場合（is_finished: true）：
   - 危険度（urgency）は "安心"、"注意"、"危険" のいずれか。
   - 総合メッセージ（urgency_message）。
   - 聞いた症状のまとめ（symptoms: 文字列のリスト）。
   - 第1候補の病気名（primary_disease）とその対処法（primary_treatment）。
   - 考えられる病気の候補リスト（diseases: 各要素に name, percentage(数値), description, treatment を含む）。
   - reply には結果発表のメッセージを入れてください。
   - templates は空配列 [] にしてください。

必ず以下のJSON形式のみで返答してください（Markdownの ```json ... ``` で囲んでも構いません）：
{
  "is_finished": false,
  "reply": "AIの返答メッセージ",
  "templates": ["食欲がない", "元気がない", "特にない"],
  "result": null
}
"""


@app.post("/api/chat")
async def chat_with_gemini(data: ChatRequest):
    user_message = data.message
    turn_count = data.turn_count
    
    prompt = f"""
    現在のやり取り回数: {turn_count}回目
    飼い主からのメッセージ: {user_message}
    
    上記を踏まえて、次の返答（または診断結果のJSON）を生成してください。
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=SYSTEM_PROMPT + "\n\n" + prompt
        )
        
        text = response.text.strip()
        # マークダウンのコードブロックをクリーンアップ
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        result_data = json.loads(text)
        return result_data
        
    except Exception as e:
        return {
            "is_finished": False,
            "reply": f"サーバーエラーが発生しました: {str(e)}",
            "templates": ["もう一度送る"],
            "result": None
        }