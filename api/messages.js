const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyMessagesScope } = require("../lib/data-scope");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  const supabase = getSupabaseAdmin();
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .gte("created_at", twelveHoursAgo)
    .order("created_at", { ascending: true });

  query = applyMessagesScope(query, ctx);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ messages: data || [] });
};
