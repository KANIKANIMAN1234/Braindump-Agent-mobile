/**
 * LINE Messaging API — Push メッセージ送信
 * 環境変数: LINE_CHANNEL_ACCESS_TOKEN（Messaging API チャネル）
 */

async function pushLineMessage(toUserId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  }
  if (!toUserId) {
    throw new Error("送信先 LINE user ID がありません");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [{ type: "text", text: String(text).slice(0, 5000) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE Push 失敗 (${res.status}): ${body}`);
  }
  return true;
}

module.exports = { pushLineMessage };
