const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyInsightsScope, scopedRowData } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    if (req.query.count === "1") {
      let query = supabase.from("t_insights").select("id", { count: "exact", head: true });
      query = applyInsightsScope(query, ctx);
      const { count, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ count: count || 0 });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    let query = supabase
      .from("t_insights")
      .select("id, content, tags, exported_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    query = applyInsightsScope(query, ctx);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ insights: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.content?.trim()) return res.status(400).json({ error: "内容は必須です" });
    const row = scopedRowData(ctx, {
      content: body.content.trim(),
      tags: body.tags || null,
    }, { withOrgUnit: true });
    const { data, error } = await supabase
      .from("t_insights")
      .insert(row)
      .select("id, content, tags, created_at")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ insight: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
