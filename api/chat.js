const { OpenAI } = require("openai");
const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { extractBearerToken } = require("../lib/line-auth");
const { resolveMemberContext } = require("../lib/member-context");
const { executeTool, getWeekRange } = require("../lib/execute-tools");
const { scopedRowData } = require("../lib/data-scope");

/* -------------------------------------------------------
 * ツール定義
 * ----------------------------------------------------- */
const tools = [
  /* ── タスク ── */
  {
    type: "function",
    function: {
      name: "add_task",
      description: "タスクを追加する",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "タスクのタイトル" },
          due_date: { type: "string", description: "期限日（YYYY-MM-DD形式）。ない場合は省略" },
          priority: { type: "string", enum: ["高", "中", "低"], description: "優先度。デフォルトは中" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "タスクを一覧取得する",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "this_week", "today", "incomplete"],
            description: "all=全件, this_week=今週期限, today=今日期限, incomplete=未完了のみ",
          },
        },
        required: ["filter"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "タスクを完了にする",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "完了にするタスク名（部分一致で検索）" },
          result: { type: "string", description: "タスクの結果・成果（任意）" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "タスクを削除する",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "削除するタスク名（部分一致で検索）" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "タスクの優先度や期限を変更する",
      parameters: {
        type: "object",
        properties: {
          title:    { type: "string", description: "変更するタスク名（部分一致で検索）" },
          priority: { type: "string", enum: ["高", "中", "低"], description: "新しい優先度" },
          due_date: { type: "string", description: "新しい期限日（YYYY-MM-DD形式）。削除する場合は 'null'" },
        },
        required: ["title"],
      },
    },
  },
  /* ── 気づき ── */
  {
    type: "function",
    function: {
      name: "add_insight",
      description: "日々の気づき・学び・メモを記録する",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "気づきの内容" },
          tags: { type: "string", description: "タグ（カンマ区切り）。例: 仕事,学び" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_insights",
      description: "記録した気づきを一覧取得する",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "取得件数（デフォルト10件）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_insights_to_google_drive",
      description: "気づきをCSVにしてGoogle Driveへアップロードする",
      parameters: { type: "object", properties: {} },
    },
  },
];

/* -------------------------------------------------------
 * ハンドラー
 * ----------------------------------------------------- */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });

  const idToken = extractBearerToken(req);
  if (!idToken) return res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });

  let ctx;
  try {
    const { verifyLineToken } = require("../lib/line-auth");
    const lineProfile = await verifyLineToken(idToken);
    ctx = await resolveMemberContext(lineProfile.userId);
    ctx.lineProfile = lineProfile;
  } catch (e) {
    return res.status(401).json({ error: `認証エラー: ${e.message}` });
  }

  if (!ctx.legacy && ctx.needsOrgSetup && ctx.member.role === "org_admin") {
    return res.status(403).json({
      error: "先に組織階層の設定を完了してください（⚙️管理メニュー）",
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supabase = getSupabaseAdmin();

  const today = new Date().toISOString().split("T")[0];
  const week = getWeekRange();

  const messages = [
    {
      role: "system",
      content: `あなたはタスク管理と日々の気づき記録をサポートするアシスタントです。
今日: ${today}（今週: ${week.start} 〜 ${week.end}）

できること：
- タスクの追加・一覧・完了・削除
- タスクの優先度変更（update_task ツールを使う）
- タスクの期日変更（update_task ツールを使う）
- 気づき・学び・メモの記録と一覧表示
- 気づきをCSVにしてDropboxへエクスポート

「〇〇を完了にして」「〇〇を完了」などの指示は必ず complete_task ツールを呼び出して実行すること。
「〇〇の優先度を△△に変更して」「〇〇の期日を△△にして」などの指示は必ず update_task ツールを呼び出して実行すること。
ツールを呼ばずに「完了しました」などと返答してはいけない。
返答は日本語で、友達に話しかけるようなフランクなトーンにしてください。
一覧を返すときは箇条書き（・）で表示してください。タスクは「タスク名（期限: MM/DD, 優先度: 高/中/低）」の形式で表示してください。`,
    },
    { role: "user", content: message },
  ];

  try {
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;
    let taskListData = null;

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(supabase, toolCall.function.name, args, ctx);
        if (toolCall.function.name === "list_tasks") {
          const rows = result.tasks || [];
          taskListData = rows.filter((t) => !t.completed);
        }
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
      });
      assistantMessage = response.choices[0].message;
    }

    const reply = assistantMessage.content;

    /* チャット履歴をDBに保存（失敗しても返答は返す） */
    try {
      await supabase.from("t_chat_messages").insert([
        scopedRowData(ctx, { role: "user", content: message }, { withOrgUnit: true }),
        scopedRowData(ctx, { role: "bot", content: reply }, { withOrgUnit: true }),
      ]);
    } catch (saveErr) {
      console.error("履歴保存エラー:", saveErr);
    }

    res.status(200).json({ reply, ...(taskListData !== null && { tasks: taskListData }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
