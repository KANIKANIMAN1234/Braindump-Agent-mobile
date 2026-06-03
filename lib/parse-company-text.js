const { OpenAI } = require("openai");

const COMPANY_FIELDS = [
  "name",
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

const POSITION_FIELDS = ["title", "job_posting"];

const SYSTEM_PROMPT = `あなたは転職エージェント向けの採用情報整理アシスタントです。
ユーザーが貼り付けたテキストから情報を抽出し、JSONのみで返してください。

【データモデル】
- company: 企業マスタ（1社分の共通情報）
- positions: 募集ポジション（トランザクション）。複数求人があればポジションごとに1要素

【重要ルール】
1. 複数の求人・ポジション・職種がある場合は positions を必ず分割（1ポジション=1要素）
2. company.name は企業名のみ（ポジション名を含めない）。例: 株式会社ABC
3. positions[].title はポジション名。例: PMコンサル、バックエンドエンジニア
4. positions[].job_posting にはそのポジション固有の募集要項全文
5. company には企業文化・連絡先など共通情報。positions にはポジション固有の募集内容
6. 原文にない情報は null（推測禁止）
7. 複数社が混在する場合は entries 配列に分ける（1社なら entries 要素1個）

【返却JSON形式】
{
  "entries": [
    {
      "company": {
        "name": "string（必須）",
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
      },
      "positions": [
        { "title": "string（必須）", "job_posting": "string|null" }
      ]
    }
  ]
}`;

function normalizeCompany(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const row = { name };
  COMPANY_FIELDS.forEach((f) => {
    if (f === "name") return;
    const v = raw[f];
    row[f] = v == null || v === "" ? null : String(v).trim();
  });
  return row;
}

function normalizePosition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim();
  if (!title) return null;
  return {
    title,
    job_posting: raw.job_posting == null || raw.job_posting === "" ? null : String(raw.job_posting).trim(),
  };
}

function normalizeEntry(raw) {
  const company = normalizeCompany(raw?.company);
  if (!company) return null;
  const positions = (raw.positions || []).map(normalizePosition).filter(Boolean);
  if (!positions.length) return null;
  return { company, positions };
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

  const entries = (parsed.entries || []).map(normalizeEntry).filter(Boolean);
  if (!entries.length) {
    throw new Error("企業・ポジションを抽出できませんでした。テキスト内容を確認してください");
  }

  const positionCount = entries.reduce((n, e) => n + e.positions.length, 0);
  return { entries, entryCount: entries.length, positionCount };
}

module.exports = { parseCompanyText, COMPANY_FIELDS, POSITION_FIELDS };
