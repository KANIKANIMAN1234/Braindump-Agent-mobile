const crypto = require("crypto");

const INVITE_TTL_DAYS = 7;

function generateInviteCode() {
  return crypto.randomBytes(16).toString("base64url");
}

function getInviteExpiresAt() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function buildLiffInviteUrl(code) {
  const liffId = process.env.LIFF_ID || "2010175951-S9r18QtA";
  return `https://liff.line.me/${liffId}?invite=${encodeURIComponent(code)}`;
}

module.exports = {
  INVITE_TTL_DAYS,
  generateInviteCode,
  getInviteExpiresAt,
  buildLiffInviteUrl,
};
