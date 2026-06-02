const { getSupabaseAdmin } = require("../supabase-admin");
const { verifyLineToken, extractBearerToken } = require("../line-auth");

/**
 * GET /api/auth/me
 * 現在の LINE ユーザーに紐づくメンバー情報（未登録なら legacy モード）
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });
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

  const lineUserId = String(lineProfile.userId || "").trim();

  const { data: members, error } = await supabase
    .from("members")
    .select(
      "id, organization_id, org_unit_id, role, display_name, line_user_id, status, activated_at"
    )
    .eq("line_user_id", lineUserId)
    .eq("status", "active");

  if (error) return res.status(500).json({ error: error.message });

  if (!members || members.length === 0) {
    return res.status(200).json({
      legacy: true,
      lineProfile: {
        userId: lineUserId,
        displayName: lineProfile.displayName,
        pictureUrl: lineProfile.pictureUrl,
      },
    });
  }

  const member = members[0];

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, status, org_structure_depth")
    .eq("id", member.organization_id)
    .single();

  if (orgError) return res.status(500).json({ error: orgError.message });

  return res.status(200).json({
    legacy: false,
    member,
    organization,
    memberships: members.length > 1 ? members : undefined,
    lineProfile: {
      userId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl,
    },
    needsOrgSetup:
      member.role === "org_admin" && organization?.status === "pending_setup",
    canInvite:
      ["org_admin", "unit_admin", "dept_admin"].includes(member.role) &&
      organization?.status === "active" &&
      organization?.org_structure_depth !== 0,
    isAdmin: ["org_admin", "unit_admin", "dept_admin"].includes(member.role),
  });
};
