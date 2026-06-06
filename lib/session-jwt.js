const crypto = require("crypto");

const TTL_SEC = 8 * 60 * 60;

function getSecret() {
  return (
    process.env.SESSION_JWT_SECRET ||
    process.env.PLATFORM_ADMIN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function ctxFromPayload(p) {
  if (p.legacy) {
    return {
      legacy: true,
      lineUserId: p.lineUserId,
      lineProfile: p.lineProfile,
    };
  }
  return {
    legacy: false,
    lineUserId: p.lineUserId,
    member: p.member,
    organization: p.organization,
    accessibleUnitIds: p.accessibleUnitIds || [],
    isAdmin: p.isAdmin,
    canManageOrg: p.canManageOrg,
    canInvite: p.canInvite,
    needsOrgSetup: p.needsOrgSetup,
    lineProfile: p.lineProfile,
  };
}

function signSession(ctx, lineProfile) {
  const secret = getSecret();
  if (!secret) throw new Error("SESSION_JWT_SECRET が未設定です");

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + TTL_SEC,
    legacy: !!ctx.legacy,
    lineUserId: ctx.lineUserId,
  };

  if (!ctx.legacy) {
    payload.member = ctx.member;
    payload.organization = ctx.organization;
    payload.accessibleUnitIds = ctx.accessibleUnitIds || [];
    payload.isAdmin = ctx.isAdmin;
    payload.canManageOrg = ctx.canManageOrg;
    payload.canInvite = ctx.canInvite;
    payload.needsOrgSetup = ctx.needsOrgSetup;
  }

  if (lineProfile) {
    payload.lineProfile = {
      userId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl,
    };
  }

  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const secret = getSecret();
  if (!secret) return null;

  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  if (sig !== expected) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.v !== 1) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return ctxFromPayload(payload);
}

module.exports = { signSession, verifySession, TTL_SEC };
