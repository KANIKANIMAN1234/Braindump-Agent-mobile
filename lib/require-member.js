const { verifyLineToken, extractBearerToken } = require("./line-auth");
const { resolveMemberContext } = require("./member-context");
const { verifySession } = require("./session-jwt");

async function requireLineMember(req, res) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });
    return null;
  }

  const sessionCtx = verifySession(token);
  if (sessionCtx) return sessionCtx;

  let lineProfile;
  try {
    lineProfile = await verifyLineToken(token);
  } catch (e) {
    res.status(401).json({ error: `認証エラー: ${e.message}` });
    return null;
  }

  try {
    const ctx = await resolveMemberContext(lineProfile.userId);
    ctx.lineProfile = {
      userId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl,
    };
    return ctx;
  } catch (e) {
    res.status(500).json({ error: e.message });
    return null;
  }
}

module.exports = { requireLineMember };
