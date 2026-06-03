const { requireLineMember } = require("../lib/require-member");
const { parseCompanyText } = require("../lib/parse-company-text");
const { handleOptions } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "採用企業管理は法人メンバー登録後に利用できます" });
  }

  const { content } = req.body || {};
  try {
    const result = await parseCompanyText(content);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
