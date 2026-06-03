const { requireLineMember } = require("../lib/require-member");
const { parseJobSeekerText } = require("../lib/parse-job-seeker-text");
const { handleOptions } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  const { content } = req.body || {};
  try {
    const result = await parseJobSeekerText(content);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
