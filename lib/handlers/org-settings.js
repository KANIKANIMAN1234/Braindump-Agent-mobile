const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const { handleOptions } = require("../cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人メンバー登録後に利用できます" });
  }

  const supabase = getSupabaseAdmin();
  const orgId = ctx.member.organization_id;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("organization_settings")
      .select("organization_id, google_drive_folder_id, google_drive_enabled, updated_at")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      settings: data || {
        organization_id: orgId,
        google_drive_folder_id: null,
        google_drive_enabled: false,
      },
    });
  }

  if (req.method === "PATCH") {
    if (ctx.member.role !== "org_admin") {
      return res.status(403).json({ error: "org_admin のみ設定できます" });
    }
    const body = req.body || {};
    const row = {
      organization_id: orgId,
      google_drive_folder_id: body.google_drive_folder_id?.trim() || null,
      google_drive_enabled: body.google_drive_enabled !== false,
      updated_at: new Date().toISOString(),
      updated_by_member_id: ctx.member.id,
    };
    const { data, error } = await supabase
      .from("organization_settings")
      .upsert(row, { onConflict: "organization_id" })
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ settings: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
