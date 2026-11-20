document.addEventListener("DOMContentLoaded", async () => {
    const searchForm = document.getElementById("food-search-form");
    const searchBox = document.getElementById("food-search-box");
    const foodList = document.getElementById("food-list");
    const resultCount = document.getElementById("result-count");
    const resultsTitle = document.getElementById("results-title");
    const resultSection = document.getElementById("food-result-section");
    const categoryButtons = document.querySelectorAll(".category-button");
    const keywordButtons = document.querySelectorAll(".keyword-chip");

    let allFoods = [];
    let selectedCategory = "all";
    let currentKeyword = "";

    const categoryLabels = {
        danger: "危険",
        caution: "注意",
        safe: "条件付きで食べられる",
        unknown: "情報不足"
    };

    try {
        const response = await fetch("data/food_data.json");
        if (!response.ok) throw new Error("食べ物データを読み込めませんでした");
        allFoods = await response.json();
        renderFoods();
    } catch (error) {
        console.error(error);
        foodList.innerHTML = '<p class="empty-message">食べ物データを読み込めませんでした。data/food_data.json の配置を確認してください。</p>';
        resultCount.textContent = "";
    }

    function normalize(value) {
        return String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
    }

    function renderFoods() {
        const keyword = normalize(currentKeyword);
        const keywords = keyword.split(/[\s\u3000]+/).filter(Boolean);

        const filtered = allFoods.filter(food => {
            const categoryMatch = selectedCategory === "all" || food.category === selectedCategory;
            const searchable = normalize([
                food.name,
                ...(food.aliases || []),
                food.reason,
                food.condition
            ].join(" "));
            const keywordMatch = keywords.length === 0 || keywords.every(word => searchable.includes(word));
            return categoryMatch && keywordMatch;
        });

        foodList.innerHTML = "";
        resultCount.textContent = `${filtered.length}件`;
        resultsTitle.textContent = currentKeyword ? "検索結果" : "食べ物一覧";

        if (filtered.length === 0) {
            foodList.innerHTML = '<p class="empty-message">該当する食べ物が見つかりませんでした。別の名前で検索するか、カテゴリーを変更してください。<br>※登録されていない食べ物が安全という意味ではありません。</p>';
            return;
        }

        filtered.forEach(food => {
            const details = document.createElement("details");
            details.className = "food-card";

            const summary = document.createElement("summary");
            const name = document.createElement("span");
            name.className = "food-card-name";
            name.textContent = food.name;

            const badge = document.createElement("span");
            badge.className = `food-badge ${food.category}`;
            badge.textContent = categoryLabels[food.category] || "情報不足";

            summary.append(name, badge);

            const content = document.createElement("div");
            content.className = "food-card-content";

            addParagraph(content, "判定理由", food.reason);
            addParagraph(content, "与える際の条件", food.condition);
            if (food.symptoms && food.symptoms.length) {
                addParagraph(content, "考えられる症状", food.symptoms.join("・"));
            }
            addParagraph(content, "対処・注意", food.action, "food-action");

            details.append(summary, content);
            foodList.appendChild(details);
        });
    }

    function addParagraph(parent, label, value, extraClass = "") {
        if (!value) return;
        const p = document.createElement("p");
        if (extraClass) p.className = extraClass;
        const strong = document.createElement("strong");
        strong.textContent = `${label}：`;
        p.append(strong, document.createTextNode(value));
        parent.appendChild(p);
    }

    function scrollToResults() {
        if (!resultSection) return;
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // 入力中はリアルタイムで絞り込みのみ行う（スクロールはしない）
    searchBox.addEventListener("input", () => {
        currentKeyword = searchBox.value;
        renderFoods();
    });

    // Enterキーまたは検索ボタンで検索して結果欄へ移動
    searchForm.addEventListener("submit", event => {
        event.preventDefault();
        currentKeyword = searchBox.value;
        renderFoods();
        scrollToResults();
    });

    // カテゴリー切り替え時は絞り込みのみ行う
    categoryButtons.forEach(button => {
        button.addEventListener("click", () => {
            selectedCategory = button.dataset.category;
            categoryButtons.forEach(item => item.classList.toggle("is-active", item === button));
            renderFoods();
        });
    });

    // 人気キーワードは入力欄へ反映＋検索＋結果欄へ移動
    keywordButtons.forEach(button => {
        button.addEventListener("click", () => {
            searchBox.value = button.dataset.keyword;
            currentKeyword = button.dataset.keyword;
            renderFoods();
            scrollToResults();
        });
    });
});