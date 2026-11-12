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
    document.getElementById("chat-main");

const profileForm =
    document.getElementById("profile-form");

const profilePanel =
    document.getElementById("profile-panel");

const profileSubmit =
    profileForm.querySelector("button[type='submit']");

const sendButton =
    chatForm.querySelector("button[type='submit']");

const resultScreen =
    document.getElementById("result-screen");

const resultContent =
    document.getElementById("result-content");


if (
    !chatBox ||
    !chatForm ||
    !userInput ||
    !optionsContainer ||
    !chatControls ||
    !chatPage ||
    !profileForm ||
    !profilePanel ||
    !resultScreen ||
    !resultContent
) {
    throw new Error("必要なHTML要素が見つかりません。");
}


const conversationHistory = [];

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

    document.querySelectorAll(".progress__step")
        .forEach(step => {

            const number = Number(step.dataset.step);

            const currentStep = finished
                ? 3
                : hasStartedChat ? 2 : 1;

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

// ========================================
// 結果画面の生成
// ========================================

function showResultScreen(result, fallbackReply = "") {

    result = result || {};

    resultContent.replaceChildren();


    // HTML要素を生成する補助関数
    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;
    }


    // ========================================
    // 病気候補の取得
    // ========================================

    let diseases = Array.isArray(result.diseases)
        ? result.diseases
        : [];


    // 第1候補がリストに含まれていない場合
    if (
        result.primary_disease &&
        !diseases.some(d => d.name === result.primary_disease)
    ) {

        diseases = [
            {
                name: result.primary_disease,
                description: "",
                treatment: result.primary_treatment || ""
            },
            ...diseases
        ];

    }


    // ========================================
    // 緊急度
    // ========================================

    const urgency = [
        "安心",
        "注意",
        "危険"
    ].includes(result.urgency)
        ? result.urgency
        : "注意";


    // ========================================
    // 上部の結果カード
    // ========================================

    const overview = createElement(
        "section",
        "result-overview"
    );


    // 緊急度表示
    const urgencyBox = createElement(
        "div",
        "result-urgency"
    );

    urgencyBox.appendChild(
        createElement("span", "", "緊急度：")
    );

    const urgencyDot = createElement(
        "span",
        `result-urgency-dot result-urgency--${urgency}`
    );

    urgencyBox.appendChild(urgencyDot);

    overview.appendChild(urgencyBox);


    // 緊急度の凡例
    const legend = createElement(
        "div",
        "urgency-legend"
    );

    [
        ["安心", "安心", "#78cf63"],
        ["注意", "注意", "#ffcb35"],
        ["危険", "危険", "#ff633e"]
    ].forEach(([label, text, color]) => {

        const item = createElement(
            "div",
            "urgency-legend-item"
        );

        const dot = createElement(
            "span",
            "urgency-legend-dot"
        );

        dot.style.backgroundColor = color;

        item.appendChild(dot);

        item.appendChild(
            createElement("span", "", text)
        );

        legend.appendChild(item);

    });

    overview.appendChild(legend);


    // 総合メッセージ
    overview.appendChild(
        createElement(
            "p",
            "result-message",
            result.urgency_message ||
            fallbackReply ||
            "相談結果をご確認ください。"
        )
    );


    // ========================================
    // 症状と病気候補
    // ========================================

    const columns = createElement(
        "div",
        "result-columns"
    );


    // 症状
    const symptomSection = createElement(
        "section",
        "result-section"
    );

    symptomSection.appendChild(
        createElement("h2", "", "症状")
    );

    const symptomList = createElement(
        "ul",
        "result-symptoms"
    );

    const symptoms = Array.isArray(result.symptoms)
        ? result.symptoms
        : [];

    if (symptoms.length) {

        symptoms.forEach(symptom => {

            symptomList.appendChild(
                createElement("li", "", symptom)
            );

        });

    } else {

        symptomList.appendChild(
            createElement("li", "", "症状情報がありません。")
        );

    }

    symptomSection.appendChild(symptomList);

    columns.appendChild(symptomSection);


    // 考えられる病気
    const diseaseSection = createElement(
        "section",
        "result-section"
    );

    diseaseSection.appendChild(
        createElement("h2", "", "考えられる病気")
    );

    diseases.forEach(disease => {

        const row = createElement(
            "div",
            "result-disease-row"
        );

        const heading = createElement(
            "div",
            "result-disease-heading"
        );

        heading.appendChild(
            createElement(
                "strong",
                "",
                disease.name || "候補"
            )
        );

        const percentage = Number(disease.percentage);

        const hasPercentage =
            disease.percentage !== undefined &&
            Number.isFinite(percentage);

        if (hasPercentage) {

            heading.appendChild(
                createElement(
                    "span",
                    "",
                    `${percentage}%`
                )
            );

        }

        row.appendChild(heading);

        if (hasPercentage) {

            const track = createElement(
                "div",
                "result-progress-track"
            );

            const fill = createElement(
                "div",
                "result-progress-fill"
            );

            fill.style.width =
                `${Math.max(0, Math.min(100, percentage))}%`;

            track.appendChild(fill);

            row.appendChild(track);

        }

        diseaseSection.appendChild(row);

    });

    if (!diseases.length) {

        diseaseSection.appendChild(
            createElement(
                "p",
                "",
                "病気の候補は提示されていません。"
            )
        );

    }

    columns.appendChild(diseaseSection);

    overview.appendChild(columns);

    resultContent.appendChild(overview);


    // ========================================
    // 下部の詳細情報カード
    // ========================================

    const details = createElement(
        "section",
        "result-details"
    );

    details.appendChild(
        createElement(
            "h2",
            "",
            "考えられる病気"
        )
    );

    const detailsGrid = createElement(
        "div",
        "result-details-grid"
    );

    diseases.forEach(disease => {

        const item = createElement(
            "article",
            "result-detail-item"
        );

        item.appendChild(
            createElement(
                "h3",
                "",
                disease.name || "病気の候補"
            )
        );

        item.appendChild(
            createElement(
                "p",
                "",
                `詳細：${disease.description || "詳細情報はありません。"}`
            )
        );

        item.appendChild(
            createElement(
                "p",
                "",
                `対処法：${disease.treatment || "獣医師にご相談ください。"}`
            )
        );

        detailsGrid.appendChild(item);

    });

    details.appendChild(detailsGrid);


    // 注意書き
    details.appendChild(
        createElement(
            "p",
            "result-disclaimer",
            "※ この結果はAIによる参考情報です。確定診断ではありません。症状が悪化した場合や緊急性が疑われる場合は、速やかに動物病院を受診してください。"
        )
    );

    resultContent.appendChild(details);


    // ========================================
    // 画面切り替え
    // ========================================

    // チャットを非表示
    chatPage.hidden = true;

    chatControls.hidden = true;

    // 結果画面を表示
    resultScreen.hidden = false;

    // ページスクロールに切り替え
    document.body.classList.remove("chat-mode");

    document.body.classList.add("result-mode");

    // 進捗を結果にする
    updateProgress(true);

    // ページ先頭へ
    window.scrollTo({
        top: 0,
        behavior: "auto"
    });

}


// ========================================
// メッセージ送信処理
// ========================================

// ========================================
// メッセージ送信
// ========================================

async function sendMessage(message = userInput.value.trim()) {

    const text = String(message ?? "").trim();

    if (!text || isRequesting || isFinished) return;

    if (!catProfile) return;

    userInput.value = "";

    addMessage(text, "user");

    showLoading();

    setRequestState(true);

    try {

        const response = await fetch("/api/chat", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                message: text,

                profile: catProfile,

                turn_count: turnCount + 1,

                history: conversationHistory

            })

        });


        const data = await response.json().catch(() => ({}));


        if (!response.ok) {

            const detail =
                typeof data.detail === "string"
                    ? data.detail
                    : "サーバーとの通信に失敗しました。";

            throw new Error(detail);

        }


        if (!data || typeof data.reply !== "string") {

            throw new Error("AIの返信形式が不正です。");

        }


        turnCount++;


        // 履歴保存
        conversationHistory.push({
            role: "user",
            content: text
        });

        conversationHistory.push({
            role: "model",
            content: data.reply
        });


        removeLoading();


        // ========================================
        // 診断終了：結果画面に切り替え
        // ========================================

        if (data.is_finished === true) {

            isFinished = true;

            updateSuggestions([]);

            showResultScreen(data.result, data.reply);

            return;

        }


        // ========================================
        // 診断継続：チャット画面に表示
        // ========================================

        addMessage(data.reply, "ai");

        updateSuggestions(data.templates);


        // 10回の制限
        if (turnCount >= 10) {

            isFinished = true;

            updateSuggestions([]);

            addMessage(
                "聞き取り回数の上限に達しました。詳しい診断は動物病院でご相談ください。",
                "ai"
            );

        }

    } catch (error) {

        removeLoading();

        const errorMessage =
            error instanceof Error
                ? error.message
                : "通信エラーが発生しました。";

        addMessage(
            `申し訳ありません。${errorMessage}`,
            "ai"
        );

        userInput.value = text;

    } finally {

        setRequestState(false);

        syncChatLayout();

        if (!isFinished) {
            scrollChatToBottom();
            userInput.focus();
        }

    }

}

// ========================================
// 基礎情報フォームの送信
// ========================================

// ========================================
// 基本情報フォーム送信
// ========================================

profileForm.addEventListener("submit", (event) => {

    event.preventDefault();

    if (!profileForm.reportValidity()) return;

    if (isRequesting || hasStartedChat) return;


    // 基本情報を取得
    const formData = new FormData(profileForm);

    catProfile = {

        age: String(formData.get("age")).trim(),

        breed: String(formData.get("breed")).trim(),

        energy: String(formData.get("energy")).trim(),

        appetite: String(formData.get("appetite")).trim()

    };


    // フォームを非表示
    profilePanel.hidden = true;

    // チャット欄を表示
    chatBox.hidden = false;

    chatControls.hidden = false;

    // チャット状態に変更
    hasStartedChat = true;

    document.body.classList.add("chat-mode");

    // 進捗を健康相談に変更
    updateProgress(false);


    // 初回の挨拶はAPIを呼ばずに表示
    const greeting = "今日はどうされましたか？";

    addMessage(greeting, "ai");


    // AIの挨拶を会話履歴に保存
    conversationHistory.push({
        role: "model",
        content: greeting
    });


    // 画面位置を初期化
    syncChatLayout();

    scrollChatToBottom();

    userInput.focus();

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