const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyClientCompaniesScope } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

const COMPANY_FIELDS =
  "id, name, company_culture, internal_notes, hr_name, hr_phone, hr_email, dept_manager_name, dept_manager_phone, dept_manager_email, window_contact_name, window_contact_phone, window_contact_email, created_at, updated_at";

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "採用企業管理は法人メンバー登録後に利用できます" });
  }

  const supabase = getSupabaseAdmin();
  const id = req.query.id;

  async function enrichWithPostingCounts(companies) {
    if (!companies?.length) return companies;
    const ids = companies.map((c) => c.id);
    const { data: postings } = await supabase
      .from("t_job_postings")
      .select("client_company_id, status")
      .in("client_company_id", ids);
    const counts = {};
    (postings || []).forEach((p) => {
      if (!counts[p.client_company_id]) counts[p.client_company_id] = { total: 0, active: 0 };
      counts[p.client_company_id].total++;
      if (p.status === "active") counts[p.client_company_id].active++;
    });
    return companies.map((c) => ({
      ...c,
      posting_count: counts[c.id]?.total || 0,
      active_posting_count: counts[c.id]?.active || 0,
    }));
  }

  if (req.method === "GET" && !id) {
    let query = supabase
      .from("m_client_companies")
      .select(COMPANY_FIELDS)
      .order("name", { ascending: true });
    query = applyClientCompaniesScope(query, ctx);
    const q = req.query.q;
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const enriched = await enrichWithPostingCounts(data || []);
    return res.status(200).json({ companies: enriched });
  }

  if (req.method === "GET" && id) {
    let query = supabase.from("m_client_companies").select(COMPANY_FIELDS).eq("id", id);
    query = applyClientCompaniesScope(query, ctx);
    const { data, error } = await query.maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "採用企業が見つかりません" });
    const { data: postings } = await supabase
      .from("t_job_postings")
      .select("id, title, status, updated_at")
      .eq("client_company_id", id)
      .order("updated_at", { ascending: false });
    return res.status(200).json({
      company: { ...data, postings: postings || [] },
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.name?.trim()) return res.status(400).json({ error: "企業名は必須です" });
    const row = {
      organization_id: ctx.member.organization_id,
      name: body.name.trim(),
      company_culture: body.company_culture || null,
      internal_notes: body.internal_notes || null,
      hr_name: body.hr_name || null,
      hr_phone: body.hr_phone || null,
      hr_email: body.hr_email || null,
      dept_manager_name: body.dept_manager_name || null,
      dept_manager_phone: body.dept_manager_phone || null,
      dept_manager_email: body.dept_manager_email || null,
      window_contact_name: body.window_contact_name || null,
      window_contact_phone: body.window_contact_phone || null,
      window_contact_email: body.window_contact_email || null,
      created_by_member_id: ctx.member.id,
      updated_by_member_id: ctx.member.id,
    };
    const { data, error } = await supabase.from("m_client_companies").insert(row).select(COMPANY_FIELDS).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ company: data });
  }

  if (req.method === "PATCH" && id) {
    let findQ = supabase.from("m_client_companies").select("id").eq("id", id);
    findQ = applyClientCompaniesScope(findQ, ctx);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "採用企業が見つかりません" });

    const body = req.body || {};
    const update = { updated_by_member_id: ctx.member.id, updated_at: new Date().toISOString() };
    const fields = [
      "name", "company_culture", "internal_notes",
      "hr_name", "hr_phone", "hr_email",
      "dept_manager_name", "dept_manager_phone", "dept_manager_email",
      "window_contact_name", "window_contact_phone", "window_contact_email",
    ];
    fields.forEach((f) => {
      if (body[f] !== undefined) update[f] = body[f] || null;
    });
    if (update.name === "") return res.status(400).json({ error: "企業名は必須です" });

    const { data, error } = await supabase
      .from("m_client_companies")
      .update(update)
      .eq("id", id)
      .select(COMPANY_FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ company: data });
  }

  if (req.method === "DELETE" && id) {
    let findQ = supabase.from("m_client_companies").select("id").eq("id", id);
    findQ = applyClientCompaniesScope(findQ, ctx);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "採用企業が見つかりません" });
    const { error } = await supabase.from("m_client_companies").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
