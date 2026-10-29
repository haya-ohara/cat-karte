async function sendMessage() {
  const inputField = document.getElementById('user-input');
  const chatBox = document.getElementById('chat-box');
  const text = inputField.value;
  if (!text) return;

  // ユーザーの発言を表示
  chatBox.innerHTML += `<p><b>あなた:</b> ${text}</p>`;
  inputField.value = '';

  try {
    // FastAPI（バックエンド）へPOSTリクエストを送信
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();
    
    // AIからの返答を表示
    chatBox.innerHTML += `<p><b>ネコAI:</b> ${data.reply}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (error) {
    chatBox.innerHTML += `<p style="color: red;">エラーが発生しました。</p>`;
  }
}