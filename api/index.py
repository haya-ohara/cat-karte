import os
import json
import re
import logging

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from google import genai
from google.genai import errors

from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)
app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent.parent

for folder in ("css", "js", "data", "img"):
    folder_path = BASE_DIR / folder
    if folder_path.exists():
        app.mount(f"/{folder}", StaticFiles(directory=str(folder_path)), name=folder)

templates = Jinja2Templates(directory=str(BASE_DIR))


# ---------- HTMLページ ----------

@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    # トップページにチャット画面を表示
    return templates.TemplateResponse(request, "chat.html")


@app.get("/{page_name}.html", response_class=HTMLResponse)
async def serve_html_page(request: Request, page_name: str):
    file_path = BASE_DIR / f"{page_name}.html"
    if file_path.is_file():
        return templates.TemplateResponse(request, f"{page_name}.html")
    raise HTTPException(status_code=404, detail="Page not found")


@app.post("/contact_finished.html", response_class=HTMLResponse)
async def contact_submit(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    message: str = Form(...),
):
    return templates.TemplateResponse(
        request,
        "contact_finished.html",
        {"name": name, "email": email, "message": message},
    )


# ---------- チャットAPI ----------

class HistoryMessage(BaseModel):
    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=4000)


# ========================================
# チャットAPIのデータモデル
# ========================================

# ========================================
# チャットデータモデル
# ========================================

class CatProfile(BaseModel):
    age: str
    breed: str
    energy: str
    appetite: str


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    turn_count: int = 0
    profile: CatProfile
    history: list[ChatHistoryItem] = Field(default_factory=list)

class DiseaseCandidate(BaseModel):
    name: str
    percentage: float
    description: str
    treatment: str


class DiagnosisResult(BaseModel):
    urgency: Literal["安心", "注意", "危険"]
    urgency_message: str
    symptoms: list[str]
    primary_disease: str
    primary_treatment: str
    diseases: list[DiseaseCandidate]


class ChatResponse(BaseModel):
    is_finished: bool
    reply: str
    templates: list[str] = Field(default_factory=list)
    result: DiagnosisResult | None = None


SYSTEM_PROMPT = """
あなたは猫の健康相談を補助するAIです。

飼い主から提供された基本情報と症状をもとに、
必要な追加情報を確認し、考えられる病気と対応方法を提案してください。

あなたは獣医師ではありません。
確定診断をせず、必要に応じて動物病院への受診を勧めてください。

【基本ルール】

1. 猫の年齢、猫種、元気、食欲は既知の情報として扱う。
2. 既に分かっていることを再度質問しない。
3. 質問は1回につき1つだけ。
4. 質問は原則40文字以内にする。
5. 不要な前置きや長い説明を避ける。
6. 返信候補は2〜3個の短い文章にする。
7. 追加質問が10回に達した場合は診断を終了する。
8. 情報が十分な場合も診断を終了してよい。
9. 呼吸困難、けいれん、排尿できないなどの緊急症状が疑われる場合は、質問より受診を優先する。

【診断継続時】

is_finished: false
reply: 短い返答と次の質問
templates: 2〜3個の選択肢
result: null

【診断終了時】

is_finished: true
reply: 結果を知らせる短い文章
templates: []
result:
- urgency: 安心、注意、危険
- urgency_message: 総合メッセージ
- symptoms: 症状のリスト
- primary_disease: 最も考えられる病気
- primary_treatment: 対応方法
- diseases:
    - name
    - percentage
    - description
    - treatment

percentageは医学的に確立された診断確率ではなく、
参考上の目安として扱う。

必ずJSONのみで返答する。

{
    "is_finished": false,
    "reply": "質問内容",
    "templates": ["選択肢1", "選択肢2", "選択肢3"],
    "result": null
}
"""


def get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="サーバーに GEMINI_API_KEY が設定されていません。",
        )
    return genai.Client(api_key=api_key)


def clean_json_text(text: str) -> str:
    """万一コードフェンス付きで返ってきた場合もJSON部分を取り出す。"""
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


# ========================================
# Gemini API設定
# ========================================

logger = logging.getLogger(__name__)

client = genai.Client()

PRIMARY_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "gemini-3.1-flash-lite"


# ========================================
# モデルの自動切替
# ========================================

def generate_with_fallback(contents):

    try:

        # 通常モデル
        response = client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=contents
        )

        logger.info(f"使用モデル: {PRIMARY_MODEL}")

        return response


    except errors.APIError as e:

        # 429以外は切り替えない
        if int(getattr(e, "code", 0) or 0) != 429:
            raise

        logger.warning(
            f"{PRIMARY_MODEL} の利用制限を検出。"
            f"{FALLBACK_MODEL} に切り替えます。"
        )


    # 予備モデルで再試行
    response = client.models.generate_content(
        model=FALLBACK_MODEL,
        contents=contents
    )

    logger.info(f"使用モデル: {FALLBACK_MODEL}")

    return response


# ========================================
# JSONの解析
# ========================================

def parse_ai_json(text):

    if not text:
        raise ValueError("AIから空の返信が返されました。")

    text = text.strip()

    # Markdownコードブロックを除去
    text = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        text,
        flags=re.IGNORECASE
    ).strip()

    # JSON部分を抽出
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1:
        raise ValueError("JSON形式の返信がありません。")

    result = json.loads(text[start:end + 1])

    if not isinstance(result, dict):
        raise ValueError("JSONの形式が不正です。")

    if not isinstance(result.get("reply"), str):
        raise ValueError("replyが文字列ではありません。")

    if not isinstance(result.get("templates", []), list):
        raise ValueError("templatesの形式が不正です。")

    return result


# ========================================
# 猫の健康相談API
# ========================================

@app.post("/api/chat")
async def chat_with_gemini(data: ChatRequest):

    try:

        # 猫の基本情報
        profile = data.profile.model_dump()

        profile_json = json.dumps(
            profile,
            ensure_ascii=False
        )


        # 会話履歴
        history_text = ""

        for item in data.history[-20:]:

            role = (
                "飼い主"
                if item.role == "user"
                else "AI"
            )

            history_text += (
                f"{role}：{item.content}\n"
            )


        # AIへの追加指示
        prompt = f"""
【猫の基本情報】

{profile_json}


【現在の追加質問回数】

{data.turn_count}回目


【これまでの会話履歴】

{history_text if history_text else "まだありません。"}


【今回の飼い主のメッセージ】

{data.message}


基本情報と会話履歴を踏まえて回答してください。

既知の情報を繰り返し質問せず、
不足している情報だけを確認してください。

質問が必要な場合は、短い質問を1つだけ作成してください。

指定されたJSON形式のみで返答してください。
"""


        contents = SYSTEM_PROMPT + "\n\n" + prompt


        # Gemini生成（必要なら予備モデルへ切替）
        response = generate_with_fallback(contents)


        # JSON解析
        result_data = parse_ai_json(response.text)


        # 必須項目の初期値
        result_data.setdefault("is_finished", False)
        result_data.setdefault("templates", [])
        result_data.setdefault("result", None)


        # 診断終了時は候補を空にする
        if result_data["is_finished"]:
            result_data["templates"] = []


        return result_data


    except Exception:

        # 詳細はVercelのログで確認
        logger.exception("猫の健康相談APIでエラーが発生しました。")

        # 内部エラー情報はユーザーにそのまま見せない
        return {
            "is_finished": False,
            "reply": (
                "申し訳ありません。現在、AIの応答を取得できません。"
                "少し時間をおいて、もう一度お試しください。"
            ),
            "templates": ["もう一度送る"],
            "result": None
        }