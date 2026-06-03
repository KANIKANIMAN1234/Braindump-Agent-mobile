const { OpenAI } = require("openai");

const CONTACT_FIELDS = [
  "hr_name",
  "hr_phone",
  "hr_email",
  "dept_manager_name",
  "dept_manager_phone",
  "dept_manager_email",
  "window_contact_name",
  "window_contact_phone",
  "window_contact_email",
];

const SYSTEM_PROMPT = `あなたは転職エージェント向けの名刺・メール署名解析アシスタントです。
入力（テキストまたは名刺画像）から担当者連絡先を抽出し、JSONのみで返してください。

【振分けルール】
1. hr_* … 人事部・HR・Human Resources・総務人事・People など「人事」系
2. dept_manager_* … 採用部門責任者・採用担当部長・リクルーティング・Talent Acquisition・Hiring Manager など「採用部署の責任者」系
3. window_contact_* … 上記2つに明確に該当しない採用関連窓口・エージェント向け担当・一般の採用担当者

【その他ルール】
- 担当者が1名のみ: 部署名・役職・肩書きから最も適切な1カテゴリにのみ割当（他カテゴリは null）
- 複数担当者: 各人を適切なカテゴリへ（同一カテゴリに複数人分は入れない。最も主要な1名）
- 読み取れた項目のみ値を入れる。推測・創作禁止。不明は null
- 電話番号は原文どおり（ハイフン可）。メールは小文字化不要

【返却JSON】
{
  "hr_name": "string|null",
  "hr_phone": "string|null",
  "hr_email": "string|null",
  "dept_manager_name": "string|null",
  "dept_manager_phone": "string|null",
  "dept_manager_email": "string|null",
  "window_contact_name": "string|null",
  "window_contact_phone": "string|null",
  "window_contact_email": "string|null",
  "summary": "string|null（どのカテゴリに振分けたか1行説明）"
}`;

function normalizeContacts(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = {};
  let hasAny = false;
  CONTACT_FIELDS.forEach((f) => {
    const v = raw[f];
    row[f] = v == null || v === "" ? null : String(v).trim();
    if (row[f]) hasAny = true;
  });
  if (!hasAny) return null;
  row.summary = raw.summary == null || raw.summary === "" ? null : String(raw.summary).trim();
  return row;
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です");
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  });
  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error("AI の応答を解析できませんでした");
  }
  const contacts = normalizeContacts(parsed);
  if (!contacts) {
    throw new Error("担当者情報を抽出できませんでした。名刺または署名の内容を確認してください");
  }
  return { contacts, summary: contacts.summary || null };
}

async function parseContactsFromText(content) {
  const text = String(content || "").trim();
  if (!text) throw new Error("テキストが空です");
  if (text.length > 20000) throw new Error("テキストが長すぎます（20,000文字以内）");
  return callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ]);
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function parseContactsFromImage(imageBase64, mimeType) {
  if (!imageBase64) throw new Error("画像データがありません");
  const mime = String(mimeType || "image/jpeg").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    throw new Error("対応形式: JPEG, PNG, WebP, GIF");
  }
  const sizeBytes = Math.ceil((imageBase64.length * 3) / 4);
  if (sizeBytes > 5 * 1024 * 1024) throw new Error("画像が大きすぎます（5MB以内）");

  return callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "この名刺画像から担当者連絡先を抽出し、振分けルールに従ってJSONで返してください。" },
        { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
      ],
    },
  ]);
}

async function parseCompanyContacts({ content, imageBase64, mimeType }) {
  if (imageBase64) return parseContactsFromImage(imageBase64, mimeType);
  if (content) return parseContactsFromText(content);
  throw new Error("メール署名のテキストまたは名刺画像を指定してください");
}

module.exports = {
  parseCompanyContacts,
  parseContactsFromText,
  parseContactsFromImage,
  CONTACT_FIELDS,
};
