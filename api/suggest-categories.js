const { OpenAI } = require("openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content is required" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            '以下の気づきに対して適切なカテゴリを4〜5個提案してください。必ず {"categories": ["カテゴリ1","カテゴリ2",...]} の形式で返してください。',
        },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
      : ["仕事", "学び", "アイデア", "日常", "その他"];

    res.status(200).json({ categories });
  } catch {
    res.status(200).json({ categories: ["仕事", "学び", "アイデア", "日常", "その他"] });
  }
};
