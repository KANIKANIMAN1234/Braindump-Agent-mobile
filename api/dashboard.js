const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { fetchDashboardData } = require("../lib/dashboard-data");
const { handleOptions } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  try {
    const supabase = getSupabaseAdmin();
    const data = await fetchDashboardData(supabase, ctx);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
