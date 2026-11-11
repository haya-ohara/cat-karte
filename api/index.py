import json
import logging
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError


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


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    turn_count: int = Field(default=1, ge=1, le=10)
    history: list[HistoryMessage] = Field(default_factory=list)


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
あなたは優秀な獣医師AIです。
飼い主からの相談を聞き、必要な質問を重ねて症状を整理し、受診の目安を案内してください。

【必ず守ること】
1. 診断が続いている間は is_finished を false にし、reply に自然な返答・質問を入れてください。
2. 診断継続中の templates は、次に飼い主が回答しやすい短い候補を2〜3個入れてください。result は null にしてください。
3. やり取りが10回目に達した場合、または十分な情報が集まった場合は is_finished を true にしてください。
4. 診断終了時は urgency を「安心」「注意」「危険」のいずれかにし、urgency_message、symptoms、primary_disease、primary_treatment、diseases を設定してください。
5. 診断終了時の templates は空配列にしてください。
6. 病名や確率を確定的な事実として扱わず、「可能性」「目安」として説明してください。割合は統計的な診断精度を意味しないため、断定的な確率として表現しないでください。
7. 呼吸困難、けいれん、意識障害、尿が出ない、強い出血、誤食・中毒の疑いなど緊急性が疑われる場合は、質問を続けず、直ちに動物病院・救急動物病院へ連絡するよう案内してください。
8. 薬の量や人間用医薬品の投与を指示しないでください。

返答は指定されたJSON Schemaに従うJSONオブジェクトのみとし、Markdownやコードフェンスは付けないでください。
"percentage" は0から100の数値で返してください。
"""


def get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
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


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_gemini(data: ChatRequest):
    # Geminiには、現在の入力より前の会話履歴を渡す
    contents = []
    for item in data.history[-20:]:
        contents.append(
            types.Content(
                role=item.role,
                parts=[types.Part.from_text(text=item.content)],
            )
        )

    current_message = (
        f"現在のやり取り回数: {data.turn_count}回目\n"
        f"飼い主からのメッセージ: {data.message}"
    )
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=current_message)],
        )
    )

    try:
        client = get_genai_client()
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ChatResponse,
            ),
        )

        if not response.text:
            raise ValueError("Geminiから空の応答が返されました。")

        parsed = json.loads(clean_json_text(response.text))
        chat_response = ChatResponse.model_validate(parsed)

        # 仕様上、診断終了後に返信候補は表示しない
        if chat_response.is_finished:
            chat_response.templates = []

        return chat_response.model_dump()

    except HTTPException:
        raise
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.exception("Gemini response could not be parsed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AIの返答を正しいJSONとして読み取れませんでした。もう一度お試しください。",
        ) from exc
    except Exception as exc:
        logger.exception("Gemini API error: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AIとの通信中にエラーが発生しました。時間をおいて再度お試しください。",
        ) from exc
