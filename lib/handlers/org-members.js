const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const { fetchOrgUnits } = require("../org-tree");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人に所属していません" });
  }

  if (!ctx.isAdmin) {
    return res.status(403).json({ error: "管理者のみメンバー一覧を閲覧できます" });
  }

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("m_members")
    .select("id, organization_id, org_unit_id, role, display_name, line_user_id, status, invited_at, activated_at")
    .eq("organization_id", ctx.member.organization_id)
    .order("created_at", { ascending: true });

  if (ctx.member.role !== "org_admin" && ctx.accessibleUnitIds.length > 0) {
    query = query.in("org_unit_id", ctx.accessibleUnitIds);
  }

  const { data: members, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const units = await fetchOrgUnits(supabase, ctx.member.organization_id);
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u.name]));

  const enriched = (members || []).map((m) => ({
    ...m,
    org_unit_name: m.org_unit_id ? unitMap[m.org_unit_id] || "—" : "—",
    line_user_id: m.line_user_id ? `${m.line_user_id.slice(0, 8)}…` : null,
  }));

  return res.status(200).json({ members: enriched });
};
