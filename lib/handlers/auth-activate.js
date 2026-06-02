const { getSupabaseAdmin } = require("../supabase-admin");
const { verifyLineToken, extractBearerToken } = require("../line-auth");
const { logPlatformAudit } = require("../audit");

/**
 * POST /api/auth/activate
 * Body: { invite: "招待コード" }
 * 初回 LINE ログインで line_user_id を紐づけ
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });
  }

  const { invite: inviteCode } = req.body || {};
  if (!inviteCode || !String(inviteCode).trim()) {
    return res.status(400).json({ error: "invite（招待コード）は必須です" });
  }

  let lineProfile;
  try {
    lineProfile = await verifyLineToken(token);
  } catch (e) {
    return res.status(401).json({ error: `認証エラー: ${e.message}` });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const code = String(inviteCode).trim();

  const { data: invite, error: inviteError } = await supabase
    .from("t_member_invites")
    .select("id, member_id, code, expires_at, used_at")
    .eq("code", code)
    .single();

  if (inviteError || !invite) {
    return res.status(404).json({ error: "招待が見つかりません" });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: "招待の有効期限が切れています" });
  }

  const { data: member, error: memberError } = await supabase
    .from("m_members")
    .select(
      "id, organization_id, org_unit_id, role, display_name, line_user_id, status"
    )
    .eq("id", invite.member_id)
    .single();

  if (memberError || !member) {
    return res.status(404).json({ error: "招待に紐づくメンバーが見つかりません" });
  }

  const newLineId = String(lineProfile.userId || "").trim();
  const existingLineId = String(member.line_user_id || "").trim();
  const isRelink = member.status === "active" && !existingLineId;
  const canActivate = member.status === "invited" || isRelink;

  if (!canActivate) {
    return res.status(409).json({ error: "このメンバーは既に登録済みです" });
  }

  if (existingLineId && existingLineId !== newLineId) {
    return res.status(409).json({
      error: "このメンバーには別の LINE アカウントが紐づいています",
    });
  }

  if (invite.used_at && !isRelink && member.status !== "invited") {
    return res.status(410).json({ error: "この招待は既に使用されています" });
  }

  const { data: duplicate } = await supabase
    .from("m_members")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("line_user_id", newLineId)
    .neq("id", member.id)
    .limit(1);

  if (duplicate && duplicate.length > 0) {
    return res.status(409).json({
      error: "この LINE アカウントは既にこの法人に登録されています",
    });
  }

  const now = new Date().toISOString();

  const { data: updatedMember, error: updateError } = await supabase
    .from("m_members")
    .update({
      line_user_id: newLineId,
      status: "active",
      activated_at: now,
    })
    .eq("id", member.id)
    .select(
      "id, organization_id, org_unit_id, role, display_name, line_user_id, status, activated_at"
    )
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });

  const { error: usedError } = await supabase
    .from("t_member_invites")
    .update({ used_at: now })
    .eq("id", invite.id);

  if (usedError) return res.status(500).json({ error: usedError.message });

  const { data: organization } = await supabase
    .from("m_organizations")
    .select("id, name, status, org_structure_depth")
    .eq("id", member.organization_id)
    .single();

  await logPlatformAudit({
    actorType: "member",
    actorId: newLineId,
    action: "activate_member",
    organizationId: member.organization_id,
    metadata: { member_id: member.id, role: member.role },
  });

  return res.status(200).json({
    member: updatedMember,
    organization: organization || null,
    lineProfile: {
      userId: lineProfile.userId,
      displayName: lineProfile.displayName,
    },
    needsOrgSetup:
      updatedMember.role === "org_admin" &&
      organization?.status === "pending_setup",
  });
};
