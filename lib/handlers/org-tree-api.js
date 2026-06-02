const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const { fetchOrgUnits, buildTree, getInvitableUnits } = require("../org-tree");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人に所属していません" });
  }

  const supabase = getSupabaseAdmin();
  const units = await fetchOrgUnits(supabase, ctx.member.organization_id);
  const tree = buildTree(units);
  const invitableUnits = ctx.canInvite ? getInvitableUnits(units, ctx.member) : [];

  return res.status(200).json({
    organization: ctx.organization,
    member: {
      id: ctx.member.id,
      role: ctx.member.role,
      display_name: ctx.member.display_name,
      org_unit_id: ctx.member.org_unit_id,
    },
    tree,
    units,
    invitableUnits,
    needsOrgSetup: ctx.needsOrgSetup,
    canInvite: ctx.canInvite,
  });
};
