// ========================================
// 猫の健康相談AI チャット処理
// ========================================

const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const optionsContainer = document.getElementById("options-container");
const sendButton = chatForm.querySelector("button[type='submit']");

// 会話履歴
const conversationHistory = [];

let turnCount = 0;
let isRequesting = false;
let isFinished = false;


// ========================================
// メッセージを画面に追加
// ========================================

function addMessage(text, type) {

    const message = document.createElement("div");

    message.className = `message message--${type}`;

    message.textContent = String(text ?? "");

    chatBox.appendChild(message);

    // メッセージ追加後に一番下までスクロール
    scrollChatToBottom();

    return message;
}


// ========================================
// AIのロード中アニメーション
// ========================================

function showLoading() {

    if (document.getElementById("ai-loading")) return;

    const loading = document.createElement("div");

    loading.id = "ai-loading";

    loading.className = "message message--ai loading-box";

    loading.setAttribute(
        "aria-label",
        "AIが返信を作成しています"
    );

    loading.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    chatBox.appendChild(loading);

    scrollChatToBottom();
}


// ========================================
// チャット欄を一番下までスクロール
// ========================================

function scrollChatToBottom() {

    if (!chatBox) return;

    const scroll = () => {

        chatBox.scrollTop = chatBox.scrollHeight;

    };

    // 即時スクロール
    scroll();

    // 描画更新後
    requestAnimationFrame(() => {

        scroll();

        requestAnimationFrame(scroll);

    });

    // 画像や文字のレイアウト変化にも対応
    setTimeout(scroll, 150);
}


// ========================================
// ロード画面を削除
// ========================================

function removeLoading() {
    document.getElementById("ai-loading")?.remove();
}


// ========================================
// 送信中のボタン制御
// ========================================

function setRequestState(requesting) {
    isRequesting = requesting;

    userInput.disabled = requesting || isFinished;
    sendButton.disabled = requesting || isFinished;

    optionsContainer
        .querySelectorAll("button")
        .forEach((button) => {
            button.disabled = requesting || isFinished;
        });

    chatForm.setAttribute(
        "aria-busy",
        String(requesting)
    );
}


// ========================================
// AIから届いた返信候補を表示
// ========================================

function updateSuggestions(items) {

    // 古い候補を削除
    optionsContainer.replaceChildren();

    if (!Array.isArray(items) || isFinished) return;

    // 最大3個まで表示
    items
        .filter((item) => {
            return typeof item === "string" && item.trim();
        })
        .slice(0, 3)
        .forEach((item) => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = "option-btn";

            button.dataset.option = item;

            button.textContent = `↳ ${item}`;

            button.disabled = isRequesting;

            optionsContainer.appendChild(button);
        });
}


// ========================================
// 進捗状況を更新
// ========================================

function updateProgress(finished) {

    document
        .querySelectorAll(".progress__step")
        .forEach((step) => {

            const number = Number(step.dataset.step);

            const currentStep = finished
                ? 3
                : (turnCount === 0 ? 1 : 2);

            step.classList.toggle(
                "is-current",
                number === currentStep
            );

            step.classList.toggle(
                "is-done",
                number < currentStep
            );
        });
}


// ========================================
// 診断結果を表示
// ========================================

function appendResult(result) {

    if (!result || typeof result !== "object") return;

    const card = document.createElement("section");

    card.className = "result-card";
    card.setAttribute("aria-label", "診断結果");


    // タイトル
    const title = document.createElement("h2");

    title.textContent = "相談結果";

    card.appendChild(title);


    // 危険度
    if (result.urgency) {

        const urgency = document.createElement("span");

        urgency.className = `urgency urgency--${result.urgency}`;

        urgency.textContent = `危険度：${result.urgency}`;

        card.appendChild(urgency);
    }


    // 総合メッセージ
    if (result.urgency_message) {

        const summary = document.createElement("p");

        summary.textContent = result.urgency_message;

        card.appendChild(summary);
    }


    // 聞き取った症状
    if (
        Array.isArray(result.symptoms) &&
        result.symptoms.length
    ) {

        const heading = document.createElement("h3");

        heading.textContent = "聞き取った症状";

        card.appendChild(heading);


        const list = document.createElement("ul");

        list.className = "result-list";

        result.symptoms.forEach((symptom) => {

            const item = document.createElement("li");

            item.textContent = String(symptom);

            list.appendChild(item);
        });

        card.appendChild(list);
    }


    // 第1候補の病気
    if (result.primary_disease) {

        const heading = document.createElement("h3");

        heading.textContent =
            `考えられる病気：${result.primary_disease}`;

        card.appendChild(heading);
    }


    // 対処法
    if (result.primary_treatment) {

        const treatment = document.createElement("p");

        treatment.textContent =
            `対応の目安：${result.primary_treatment}`;

        card.appendChild(treatment);
    }


    // その他の病気候補
    if (
        Array.isArray(result.diseases) &&
        result.diseases.length
    ) {

        const heading = document.createElement("h3");

        heading.textContent = "その他の可能性";

        card.appendChild(heading);


        result.diseases.forEach((disease) => {

            const item = document.createElement("article");

            item.className = "disease-item";


            // 病気の名前と割合
            const name = document.createElement("strong");

            const percentage = Number(disease.percentage);

            name.textContent =
                `${disease.name ?? "候補"}${
                    Number.isFinite(percentage)
                        ? `（${percentage}%）`
                        : ""
                }`;

            item.appendChild(name);


            // 説明
            if (disease.description) {

                const description = document.createElement("p");

                description.textContent = disease.description;

                item.appendChild(description);
            }


            // 対処法
            if (disease.treatment) {

                const treatment = document.createElement("p");

                treatment.textContent =
                    `対応：${disease.treatment}`;

                item.appendChild(treatment);
            }


            card.appendChild(item);
        });
    }


    // 注意書き
    const disclaimer = document.createElement("p");

    disclaimer.className = "chat-note";

    disclaimer.textContent =
        "この結果は可能性の目安です。確定診断には獣医師の診察が必要です。";

    card.appendChild(disclaimer);


    // 画面に追加
    chatBox.appendChild(card);

    scrollChatToBottom();
}


// ========================================
// メッセージ送信処理
// ========================================

async function sendMessage(message = userInput.value.trim()) {

    const text = String(message ?? "").trim();

    if (!text || isRequesting || isFinished) return;

    // 入力欄を必ず空にする
    userInput.value = "";

    // ユーザーの吹き出しは必ず表示する
    addMessage(text, "user");

    showLoading();

    setRequestState(true);

    updateProgress(false);

    try {

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: text,
                turn_count: turnCount + 1,
                history: conversationHistory
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "通信に失敗しました。"
            );
        }

        if (!data || typeof data.reply !== "string") {
            throw new Error("AIの返信形式が不正です。");
        }

        turnCount++;

        conversationHistory.push({
            role: "user",
            content: text
        });

        conversationHistory.push({
            role: "model",
            content: data.reply
        });

        removeLoading();

        // AIの返信を表示
        addMessage(data.reply, "ai");

        if (data.is_finished === true) {

            isFinished = true;

            appendResult(data.result);

            updateSuggestions([]);

            updateProgress(true);

        } else {

            updateSuggestions(data.templates);

            updateProgress(false);

        }

        if (turnCount >= 10 && !isFinished) {

            isFinished = true;

            updateSuggestions([]);

            updateProgress(true);

            addMessage(
                "聞き取り回数の上限に達しました。詳しい診断は動物病院でご相談ください。",
                "ai"
            );
        }

    } catch (error) {

        removeLoading();

        addMessage(
            `申し訳ありません。${error.message}`,
            "ai"
        );

        userInput.value = text;

    } finally {

        setRequestState(false);

        scrollChatToBottom();

        userInput.focus();
    }
}


// ========================================
// フォーム送信（送信ボタン・Enterキー）
// ========================================

chatForm.addEventListener("submit", (event) => {

    event.preventDefault();

    sendMessage();
});


// ========================================
// 返信候補ボタンのクリック処理
// クリックした内容をそのままAIに送信
// ========================================

optionsContainer.addEventListener("click", (event) => {

    const button = event.target.closest(
        "button[data-option]"
    );

    if (!button || isRequesting || isFinished) return;

    // 候補の内容を直接送信する
    // 入力欄には代入しない
    sendMessage(button.dataset.option);
});


// ========================================
// 初期化
// ========================================

updateProgress(false);