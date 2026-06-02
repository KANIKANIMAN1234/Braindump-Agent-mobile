/**
 * super_admin API 認証（PLATFORM_ADMIN_SECRET）
 */
function verifyPlatformSecret(req) {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "PLATFORM_ADMIN_SECRET が未設定です" };
  }

  const header = req.headers["x-platform-secret"] || "";
  if (header !== secret) {
    return { ok: false, status: 401, error: "運営認証に失敗しました" };
  }

  return { ok: true };
}

function isPlatformDataAccessFull() {
  const mode = (process.env.PLATFORM_DATA_ACCESS || "full").toLowerCase();
  return mode === "full";
}

module.exports = { verifyPlatformSecret, isPlatformDataAccessFull };
