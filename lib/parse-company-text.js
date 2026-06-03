const { OpenAI } = require("openai");

const PARSE_FIELDS = [
  "name",
  "job_posting",
  "company_culture",
  "internal_notes",
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

const SYSTEM_PROMPT = `あなたは転職エージェント向けの採用情報整理アシスタントです。
ユーザーが貼り付けたテキストから採用企業・求人情報を抽出し、JSONのみで返してください。

【重要ルール】
1. 複数の求人・ポジション・職種がある場合は、必ずポジションごとに1要素へ分割する（1ポジション=1レコード）
2. 同一企業の複数ポジションは name を「企業名（ポジション名）」形式にする。例: 株式会社ABC（PMコンサル）
3. 原文に明記されていない情報は null にする（推測・創作禁止）
4. job_posting にはそのポジション固有の募集要項（業務内容・必須条件・待遇・勤務地など）をまとめる
5. company_culture は企業文化・風土・働き方に関する記述
6. internal_notes はエージェント向け内部メモ（原文に該当がなければ null）
7. 人事・責任者・窓口の連絡先は、原文の表記に従い hr_* / dept_manager_* / window_contact_* に振り分ける
8. ポジションが1件だけでも positions は要素1個の配列にする

【返却JSON形式】
{
  "positions": [
    {
      "name": "string（必須）",
      "job_posting": "string|null",
      "company_culture": "string|null",
      "internal_notes": "string|null",
      "hr_name": "string|null",
      "hr_phone": "string|null",
      "hr_email": "string|null",
      "dept_manager_name": "string|null",
      "dept_manager_phone": "string|null",
      "dept_manager_email": "string|null",
      "window_contact_name": "string|null",
      "window_contact_phone": "string|null",
      "window_contact_email": "string|null"
    }
  ]
}`;

function normalizePosition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const row = { name };
  PARSE_FIELDS.forEach((f) => {
    if (f === "name") return;
    const v = raw[f];
    row[f] = v == null || v === "" ? null : String(v).trim();
  });
  return row;
}

async function parseCompanyText(content) {
  const text = String(content || "").trim();
  if (!text) throw new Error("テキストが空です");
  if (text.length > 50000) throw new Error("テキストが長すぎます（50,000文字以内）");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です");

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error("AI の応答を解析できませんでした");
  }

  const positions = (parsed.positions || [])
    .map(normalizePosition)
    .filter(Boolean);

  if (!positions.length) {
    throw new Error("求人・ポジションを抽出できませんでした。テキスト内容を確認してください");
  }

  return { positions, count: positions.length };
}

module.exports = { parseCompanyText, PARSE_FIELDS };
