/**
 * LINE アクセストークン検証
 */
async function verifyLineToken(accessToken) {
  const resp = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error("LINE token verification failed");
  const data = await resp.json();
  return {
    userId: data.userId,
    displayName: data.displayName,
    pictureUrl: data.pictureUrl,
  };
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

module.exports = { verifyLineToken, extractBearerToken };
