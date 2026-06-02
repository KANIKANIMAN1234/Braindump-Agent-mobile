const { getSupabaseAdmin } = require("../../lib/supabase-admin");
const { verifyPlatformSecret } = require("../../lib/platform-auth");
const { logPlatformAudit } = require("../../lib/audit");
const {
  generateInviteCode,
  getInviteExpiresAt,
  buildLiffInviteUrl,
} = require("../../lib/invites");

/**
 * POST /api/platform/invite-representative
 * Body: { organization_id, display_name }
 * 既存法人の代表管理者（org_admin）を招待
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = verifyPlatformSecret(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { organization_id, display_name } = req.body || {};
  if (!organization_id) {
    return res.status(400).json({ error: "organization_id は必須です" });
  }
  if (!display_name || !String(display_name).trim()) {
    return res.status(400).json({ error: "display_name は必須です" });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const { data: org, error: orgError } = await supabase
    .from("m_organizations")
    .select("id, name, status")
    .eq("id", organization_id)
    .single();

  if (orgError || !org) {
    return res.status(404).json({ error: "法人が見つかりません" });
  }

  const { data: existingAdmin } = await supabase
    .from("m_members")
    .select("id, status, line_user_id")
    .eq("organization_id", organization_id)
    .eq("role", "org_admin")
    .eq("status", "active")
    .limit(1);

  if (existingAdmin && existingAdmin.length > 0) {
    return res.status(409).json({
      error: "この法人には既に有効な代表管理者が登録されています",
      member: existingAdmin[0],
    });
  }

  const repName = String(display_name).trim();

  const { data: member, error: memberError } = await supabase
    .from("m_members")
    .insert({
      organization_id,
      role: "org_admin",
      display_name: repName,
      status: "invited",
    })
    .select()
    .single();

  if (memberError) return res.status(500).json({ error: memberError.message });

  const code = generateInviteCode();
  const { data: invite, error: inviteError } = await supabase
    .from("t_member_invites")
    .insert({
      member_id: member.id,
      code,
      expires_at: getInviteExpiresAt(),
      created_by_super_admin: true,
    })
    .select()
    .single();

  if (inviteError) return res.status(500).json({ error: inviteError.message });

  const inviteUrl = buildLiffInviteUrl(code);

  await logPlatformAudit({
    actorType: "super_admin",
    action: "invite_org_admin",
    organizationId: organization_id,
    metadata: { member_id: member.id, display_name: repName },
  });

  return res.status(201).json({
    organization: org,
    member,
    invite: { ...invite, invite_url: inviteUrl },
  });
};
