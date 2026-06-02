const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const {
  fetchOrgUnits,
  canInviteRole,
  isUnitInSubtree,
  getInvitableUnits,
} = require("../org-tree");
const {
  generateInviteCode,
  getInviteExpiresAt,
  buildLiffInviteUrl,
} = require("../invites");

const ROLE_LABELS = {
  unit_admin: "本部管理者",
  dept_admin: "部門管理者",
  member: "メンバー",
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人に所属していません" });
  }

  if (!ctx.canInvite) {
    const msg =
      ctx.organization?.org_structure_depth === 0
        ? "代表者のみの組織ではメンバー招待はできません"
        : "招待する権限がありません";
    return res.status(403).json({ error: msg });
  }

  const { display_name, role, org_unit_id } = req.body || {};
  if (!display_name || !String(display_name).trim()) {
    return res.status(400).json({ error: "display_name は必須です" });
  }
  if (!role || !ROLE_LABELS[role]) {
    return res.status(400).json({ error: "role は unit_admin / dept_admin / member です" });
  }
  if (!org_unit_id) {
    return res.status(400).json({ error: "org_unit_id は必須です" });
  }

  if (!canInviteRole(ctx.member.role, role)) {
    return res.status(403).json({
      error: `${ROLE_LABELS[ctx.member.role] || ctx.member.role} は ${ROLE_LABELS[role]} を招待できません`,
    });
  }

  const supabase = getSupabaseAdmin();
  const units = await fetchOrgUnits(supabase, ctx.member.organization_id);
  const targetUnit = units.find((u) => u.id === org_unit_id);
  if (!targetUnit) {
    return res.status(404).json({ error: "指定の組織が見つかりません" });
  }

  const invitable = getInvitableUnits(units, ctx.member);
  if (!invitable.some((u) => u.id === org_unit_id)) {
    return res.status(403).json({ error: "この組織への招待権限がありません" });
  }

  if (ctx.member.role !== "org_admin") {
    if (!isUnitInSubtree(org_unit_id, ctx.member.org_unit_id, units)) {
      return res.status(403).json({ error: "配下の組織のみ招待できます" });
    }
  }

  if (role === "unit_admin" && targetUnit.unit_type !== "hq") {
    return res.status(400).json({ error: "本部管理者は本部（hq）にのみ招待できます" });
  }
  if (role === "dept_admin" && targetUnit.unit_type !== "dept") {
    return res.status(400).json({ error: "部門管理者は部門（dept）にのみ招待できます" });
  }
  if (role === "member" && targetUnit.unit_type !== "dept") {
    return res.status(400).json({ error: "メンバーは部門（dept）にのみ招待できます" });
  }

  const repName = String(display_name).trim();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      organization_id: ctx.member.organization_id,
      org_unit_id,
      role,
      display_name: repName,
      status: "invited",
    })
    .select()
    .single();

  if (memberError) return res.status(500).json({ error: memberError.message });

  const code = generateInviteCode();
  const { data: invite, error: inviteError } = await supabase
    .from("member_invites")
    .insert({
      member_id: member.id,
      code,
      expires_at: getInviteExpiresAt(),
      created_by_member_id: ctx.member.id,
      created_by_super_admin: false,
    })
    .select()
    .single();

  if (inviteError) return res.status(500).json({ error: inviteError.message });

  const inviteUrl = buildLiffInviteUrl(code);

  return res.status(201).json({
    member,
    invite: { ...invite, invite_url: inviteUrl },
    unit: targetUnit,
  });
};
