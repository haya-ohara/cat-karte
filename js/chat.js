// ========================================
// 猫の健康相談AI チャット処理
// ========================================

// ========================================
// HTML要素の取得
// ========================================

const chatBox = document.getElementById("chat-box");

const chatForm = document.getElementById("chat-form");

const userInput = document.getElementById("user-input");

const optionsContainer =
    document.getElementById("options-container");

const chatControls =
    document.querySelector(".chat-controls");

const chatPage =
    document.querySelector(".chat-page");

const profileForm =
    document.getElementById("profile-form");

const profilePanel =
    document.getElementById("profile-panel");

const sendButton =
    chatForm.querySelector("button[type='submit']");

const profileSubmit =
    profileForm.querySelector("button[type='submit']");


// 必要なHTML要素の確認
if (
    !chatBox ||
    !chatForm ||
    !userInput ||
    !optionsContainer ||
    !chatControls ||
    !chatPage ||
    !profileForm ||
    !profilePanel
) {
    throw new Error("チャットに必要なHTML要素が見つかりません。");
}


// ========================================
// チャット情報
// ========================================

const conversationHistory = [];

// フォームで取得した猫の基礎情報
let catProfile = null;

let turnCount = 0;

let isRequesting = false;

let isFinished = false;

let hasStartedChat = false;

// ========================================
// 入力エリアの高さを測定
// ========================================

function syncChatLayout() {

    if (
        !chatControls ||
        chatControls.hidden ||
        !chatPage
    ) {
        return;
    }

    // 候補と入力欄を含む全体の高さを取得
    const controlsHeight =
        chatControls.getBoundingClientRect().height;

    // 下部に余裕を持たせる
    const requiredSpace =
        Math.ceil(controlsHeight + 40);

    // チャット画面の下部余白を自動調整
    chatPage.style.setProperty(
        "--controls-space",
        `${requiredSpace}px`
    );
}


// ========================================
// 入力エリアの高さを常時監視
// ========================================

const controlsObserver = new ResizeObserver(() => {

    syncChatLayout();

    if (!chatBox.hidden) {
        requestAnimationFrame(scrollChatToBottom);
    }

});

// 候補ボタンの増減や折り返しを監視
controlsObserver.observe(chatControls);

window.addEventListener("resize", syncChatLayout);

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

    if (!chatBox || chatBox.hidden) return;

    syncChatLayout();

    requestAnimationFrame(() => {

        chatBox.scrollTop = chatBox.scrollHeight;

        requestAnimationFrame(() => {

            chatBox.scrollTop = chatBox.scrollHeight;

        });

    });
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
// 返信候補を生成
// ========================================

function updateSuggestions(items) {

    optionsContainer.replaceChildren();

    if (!Array.isArray(items) || isFinished) {
        syncChatLayout();
        return;
    }

    items
        .filter(item => {
            return typeof item === "string" && item.trim();
        })
        .slice(0, 3)
        .forEach(item => {

            const button = document.createElement("button");

            button.type = "button";

            button.className = "option-btn";

            button.dataset.option = item;

            button.textContent = `↳ ${item}`;

            button.disabled = isRequesting;

            optionsContainer.appendChild(button);

        });

    // 候補の数に応じて高さを再計算
    syncChatLayout();

    scrollChatToBottom();
}

function updateProgress(finished) {

    document
        .querySelectorAll(".progress__step")
        .forEach(step => {

            const number = Number(step.dataset.step);

            const currentStep = finished
                ? 3
                : (hasStartedChat ? 2 : 1);

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

async function sendMessage(
    message = userInput.value.trim(),
    options = {}
) {

    const {
        showUserMessage = true,
        countTurn = true
    } = options;

    const text = String(message ?? "").trim();

    if (!text || isRequesting || isFinished) return;

    if (!catProfile) return;


    // 入力欄をクリア
    userInput.value = "";


    // ユーザーのメッセージを表示
    if (showUserMessage) {
        addMessage(text, "user");
    }


    // ローディング
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

                // フォームで取得した基礎情報
                profile: catProfile,

                // 初回フォーム送信は回数に含めない
                turn_count: countTurn
                    ? turnCount + 1
                    : turnCount,

                // これまでの会話履歴
                history: conversationHistory

            })

        });


        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail || "サーバーとの通信に失敗しました。"
            );

        }


        if (!data || typeof data.reply !== "string") {

            throw new Error(
                "AIから正しい返信を取得できませんでした。"
            );

        }


        // 実際のチャット回答数だけ加算
        if (countTurn) {
            turnCount++;
        }


        // 会話履歴を保存
        conversationHistory.push({

            role: "user",

            content: text

        });

        conversationHistory.push({

            role: "model",

            content: data.reply

        });


        // ロード画面削除
        removeLoading();


        // AIの返信
        addMessage(data.reply, "ai");


        // 診断終了
        if (data.is_finished === true) {

            isFinished = true;

            appendResult(data.result);

            updateSuggestions([]);

            updateProgress(true);

        }

        // 診断継続
        else {

            updateSuggestions(data.templates);

            updateProgress(false);

        }


        // 10回に到達した場合
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


        // 通常入力の場合のみ入力欄に復元
        if (showUserMessage) {
            userInput.value = text;
        }

    } finally {

        setRequestState(false);

        syncChatLayout();

        scrollChatToBottom();

        userInput.focus();

        profileSubmit.disabled = false;

    }

}

// ========================================
// 基礎情報フォームの送信
// ========================================

profileForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    if (!profileForm.reportValidity()) return;

    if (isRequesting) return;


    // フォームの回答を取得
    const formData = new FormData(profileForm);

    catProfile = {

        age: String(formData.get("age")).trim(),

        breed: String(formData.get("breed")).trim(),

        energy: String(formData.get("energy")).trim(),

        appetite: String(formData.get("appetite")).trim()

    };


    // 二重送信防止
    profileSubmit.disabled = true;


    // フォームを非表示にする
    profilePanel.hidden = true;

    // チャット画面を表示
    chatBox.hidden = false;

    chatControls.hidden = false;

    hasStartedChat = true;

    syncChatLayout();

    updateProgress(false);


    // フォームの情報をAIに送信
    // ユーザーの吹き出しには表示しない
    await sendMessage(
        "事前情報を確認し、必要な追加質問を短く1つだけ行ってください。",
        {
            showUserMessage: false,
            countTurn: false
        }
    );

});


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

    // 候補をユーザーの回答として送信
    sendMessage(button.dataset.option);

});


// ========================================
// 初期化
// ========================================

updateProgress(false);