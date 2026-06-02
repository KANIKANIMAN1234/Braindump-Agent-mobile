const { verifyLineToken, extractBearerToken } = require("./line-auth");
const { resolveMemberContext } = require("./member-context");

async function requireLineMember(req, res) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "認証が必要です（LINEからアクセスしてください）" });
    return null;
  }

  let lineProfile;
  try {
    lineProfile = await verifyLineToken(token);
  } catch (e) {
    res.status(401).json({ error: `認証エラー: ${e.message}` });
    return null;
  }

  try {
    const ctx = await resolveMemberContext(lineProfile.userId);
    ctx.lineProfile = lineProfile;
    return ctx;
  } catch (e) {
    res.status(500).json({ error: e.message });
    return null;
  }
}

module.exports = { requireLineMember };
