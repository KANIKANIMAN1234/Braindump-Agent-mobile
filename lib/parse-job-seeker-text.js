const { OpenAI } = require("openai");

const SEEKER_FIELDS = [
  "name",
  "age",
  "current_salary_man",
  "desired_salary_man",
  "employment_status",
  "current_company",
  "desired_timing",
  "desired_job_type",
  "notes",
];

const SYSTEM_PROMPT = `あなたは転職エージェント向けの転職者情報整理アシスタントです。
ユーザーが貼り付けたテキスト（職務経歴書要約・面談メモ・エージェント共有シート等）から転職者情報を抽出し、JSONのみで返してください。

【フィールド】
- name: 氏名（必須。姓と名が分かればそのまま）
- age: 年齢（整数。原文にない場合は null）
- current_salary_man: 現年収（万円単位の整数。例: 600万→600、6000万→6000）
- desired_salary_man: 希望年収（万円単位の整数）
- employment_status: "employed"（現職あり・在職中）| "retired"（退職済み・離職中）| null
- current_company: 現職の会社名・所属
- desired_timing: 転職希望時期（例: 2026年夏、3ヶ月以内）
- desired_job_type: 転職希望職種・希望ポジション
- notes: 上記に当てはまらない補足（スキル・経歴概要・エージェント向けメモ等）

【ルール】
1. 原文にない情報は null（推測・創作禁止）
2. 年収は必ず万円整数に正規化（「600万円」→600）
3. employment_status は employed / retired のみ。判断できなければ null
4. name が取れない場合はエラー相当（name を空にしない）
5. summary に抽出の要点を1行

【返却JSON】
{
  "name": "string",
  "age": number|null,
  "current_salary_man": number|null,
  "desired_salary_man": number|null,
  "employment_status": "employed"|"retired"|null,
  "current_company": "string|null",
  "desired_timing": "string|null",
  "desired_job_type": "string|null",
  "notes": "string|null",
  "summary": "string|null"
}`;

function toManYen(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const s = String(value).replace(/[,，]/g, "").trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*万/);
  if (m) return Math.round(Number(m[1]));
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n >= 10000) return Math.round(n / 10000);
  return Math.round(n);
}

function normalizeSeeker(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;

  const row = { name };
  const age = raw.age;
  row.age = age == null || age === "" ? null : Math.round(Number(age));
  if (row.age != null && !Number.isFinite(row.age)) row.age = null;

  row.current_salary_man = toManYen(raw.current_salary_man);
  row.desired_salary_man = toManYen(raw.desired_salary_man);

  const status = raw.employment_status == null ? null : String(raw.employment_status).trim();
  row.employment_status = status === "employed" || status === "retired" ? status : null;

  ["current_company", "desired_timing", "desired_job_type", "notes"].forEach((f) => {
    const v = raw[f];
    row[f] = v == null || v === "" ? null : String(v).trim();
  });

  row.summary = raw.summary == null || raw.summary === "" ? null : String(raw.summary).trim();
  return row;
}

async function parseJobSeekerText(content) {
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

  const jobSeeker = normalizeSeeker(parsed);
  if (!jobSeeker) {
    throw new Error("転職者情報を抽出できませんでした。氏名を含むテキストか確認してください");
  }

  return { jobSeeker, summary: jobSeeker.summary || null };
}

module.exports = { parseJobSeekerText, SEEKER_FIELDS };
