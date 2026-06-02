const { OpenAI, toFile } = require("openai");

/* -------------------------------------------------------
 * LINE token 検証（アクセストークン → プロフィールAPI）
 * ----------------------------------------------------- */
async function verifyLineToken(accessToken) {
  const resp = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error("LINE token verification failed");
  const data = await resp.json();
  return data.userId;
}

function detectExtension(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "webm";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });

  try {
    await verifyLineToken(accessToken);
  } catch (e) {
    return res.status(401).json({ error: `認証エラー: ${e.message}` });
  }

  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64) return res.status(400).json({ error: "audioBase64 is required" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY が未設定です" });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const extension = detectExtension(mimeType);
    const filename = `recording.${extension}`;

    const file = await toFile(audioBuffer, filename, { type: mimeType || "audio/webm" });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "ja",
    });

    return res.status(200).json({ text: transcription.text || "" });
  } catch (err) {
    console.error("transcribe error:", err);
    return res.status(500).json({ error: err.message || "文字起こしに失敗しました" });
  }
};
