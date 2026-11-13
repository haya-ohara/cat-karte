document.addEventListener('DOMContentLoaded', () => {
    const searchBox = document.getElementById('search-box');
    const diseaseListContainer = document.getElementById('disease-list');
    
    let allDiseases = [];

    // 1. JSONファイルの読み込み
    fetch('../data/cat_disease.json')
        .then(response => {
            if (!response.ok) throw new Error('JSONファイルの読み込みに失敗しました');
            return response.json();
        })
        .then(data => {
            // JSONの構造（症状ごとに分かれているデータ）から病気データを抽出・整理
            const diseaseMap = new Map();

            data.forEach(symptomGroup => {
                symptomGroup.possible_diseases.forEach(item => {
                    // 同じ病名がすでに登録されていなければ追加
                    if (!diseaseMap.has(item.disease_name)) {
                        diseaseMap.set(item.disease_name, {
                            name: item.disease_name,
                            details: item.details,
                            solution: item.solution
                        });
                    }
                });
            });

            allDiseases = Array.from(diseaseMap.values());
            
            // 初期表示（全件表示）
            renderDiseases(allDiseases);
        })
        .catch(error => {
            console.error('エラー:', error);
            diseaseListContainer.innerHTML = '<p style="text-align:center;">データの読み込みに失敗しました。</p>';
        });

    // 2. 画面に病気リストを描画する関数
    function renderDiseases(diseases) {
        diseaseListContainer.innerHTML = '';

        if (diseases.length === 0) {
            diseaseListContainer.innerHTML = '<p style="text-align:center;">該当する病気が見つかりません。</p>';
            return;
        }

        diseases.forEach((disease, index) => {
            // リストのアイテムコンテナ
            const itemDiv = document.createElement('div');
            itemDiv.className = 'disease-item';

            // ヘッダー部分（病名 ＋ ▼/▲アイコン）
            const headerDiv = document.createElement('div');
            headerDiv.className = 'disease-header';
            headerDiv.innerHTML = `
                <span class="disease-name">${disease.name}</span>
                <span class="toggle-icon">▼</span>
            `;

            // 詳細部分（初期状態は非表示）
            const contentDiv = document.createElement('div');
            contentDiv.className = 'disease-content';
            contentDiv.style.display = 'none';
            contentDiv.innerHTML = `
                <p><strong>病状の詳細：</strong> ${disease.details}</p>
                <p><strong>対処法：</strong> ${disease.solution}</p>
            `;

            // クリック時のアコーディオン開閉処理
            headerDiv.addEventListener('click', () => {
                const isOpen = contentDiv.style.display === 'block';
                
                // 開閉の切り替え
                contentDiv.style.display = isOpen ? 'none' : 'block';
                headerDiv.querySelector('.toggle-icon').textContent = isOpen ? '▼' : '▲';
            });

            itemDiv.appendChild(headerDiv);
            itemDiv.appendChild(contentDiv);
            diseaseListContainer.appendChild(itemDiv);
        });
    }

    // 3. 検索ボックスに入力されたときのリアルタイムフィルタリング（複数キーワード対応）
    searchBox.addEventListener('input', (e) => {
        // 入力された文字を小文字にし、スペース（全角・半角）で分割して配列にする
        const keywords = e.target.value.toLowerCase().trim().split(/[\s\u3000]+/);
        
        const filteredDiseases = allDiseases.filter(disease => {
            // 空白のみの場合はすべて表示
            if (keywords.length === 1 && keywords[0] === "") return true;

            // 入力されたすべてのキーワードが、病名・詳細・対処法のいずれかに含まれているか（AND検索）
            return keywords.every(keyword => 
                disease.name.toLowerCase().includes(keyword) ||
                disease.details.toLowerCase().includes(keyword) ||
                disease.solution.toLowerCase().includes(keyword)
            );
        });

        renderDiseases(filteredDiseases);
    });
});