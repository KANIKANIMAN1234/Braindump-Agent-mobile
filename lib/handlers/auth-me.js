const { verifyLineToken, extractBearerToken } = require("../line-auth");
const { resolveMemberContext } = require("../member-context");
const { signSession } = require("../session-jwt");

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

  try {
    const ctx = await resolveMemberContext(lineProfile.userId);
    const profile = {
      userId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl,
    };
    ctx.lineProfile = profile;
    const sessionToken = signSession(ctx, profile);

    if (ctx.legacy) {
      return res.status(200).json({
        legacy: true,
        lineProfile: profile,
        sessionToken,
      });
    }

    return res.status(200).json({
      legacy: false,
      member: ctx.member,
      organization: ctx.organization,
      lineProfile: profile,
      needsOrgSetup: ctx.needsOrgSetup,
      canInvite: ctx.canInvite,
      isAdmin: ctx.isAdmin,
      sessionToken,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
