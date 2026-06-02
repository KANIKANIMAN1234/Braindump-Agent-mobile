const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyInsightsScope } = require("../lib/data-scope");
const { uploadFile, getOrganizationFolderId } = require("../lib/google-drive");
const { handleOptions } = require("../lib/cors");

function toCSV(rows) {
  if (!rows?.length) return "id,content,tags,created_at\n";
  const header = "id,content,tags,created_at";
  const lines = rows.map((r) => {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [escape(r.id), escape(r.content), escape(r.tags ?? ""), escape(r.created_at)].join(",");
  });
  return [header, ...lines].join("\n");
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("t_insights")
    .select("id, content, tags, created_at")
    .is("exported_at", null)
    .order("created_at", { ascending: true });
  query = applyInsightsScope(query, ctx);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  if (!data?.length) {
    return res.status(200).json({ success: true, count: 0, message: "未エクスポートの気づきはありません" });
  }

  try {
    let folderId;
    if (!ctx.legacy) {
      folderId = await getOrganizationFolderId(supabase, ctx.member.organization_id);
    } else {
      return res.status(400).json({ error: "気づきエクスポートは法人設定後に利用できます" });
    }

    const csv = toCSV(data);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `insights_${date}.csv`;

    const uploaded = await uploadFile({
      folderId,
      name: filename,
      mimeType: "text/csv",
      buffer: Buffer.from("\uFEFF" + csv, "utf-8"),
      subfolder: "insights",
    });

    const ids = data.map((r) => r.id);
    const { error: updateError } = await supabase
      .from("t_insights")
      .update({ exported_at: new Date().toISOString(), export_destination: "google_drive" })
      .in("id", ids);
    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.status(200).json({
      success: true,
      count: data.length,
      filename: uploaded.name,
      webViewLink: uploaded.webViewLink,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
