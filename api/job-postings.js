const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyClientCompaniesScope } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

const POSTING_FIELDS =
  "id, organization_id, client_company_id, title, job_posting, status, created_at, updated_at";

const VALID_STATUS = ["active", "closed", "draft"];

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "採用企業管理は法人メンバー登録後に利用できます" });
  }

  const supabase = getSupabaseAdmin();
  const id = req.query.id;
  const companyId = req.query.client_company_id;

  async function assertCompanyAccess(cid) {
    let q = supabase.from("m_client_companies").select("id").eq("id", cid);
    q = applyClientCompaniesScope(q, ctx);
    const { data } = await q.maybeSingle();
    if (!data) throw new Error("採用企業が見つかりません");
  }

  if (req.method === "GET" && !id) {
    if (!companyId) {
      return res.status(400).json({ error: "client_company_id は必須です" });
    }
    try {
      await assertCompanyAccess(companyId);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const { data, error } = await supabase
      .from("t_job_postings")
      .select(POSTING_FIELDS)
      .eq("client_company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ postings: data || [] });
  }

  if (req.method === "GET" && id) {
    const { data, error } = await supabase
      .from("t_job_postings")
      .select(`${POSTING_FIELDS}, m_client_companies(name)`)
      .eq("id", id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "募集ポジションが見つかりません" });
    try {
      await assertCompanyAccess(data.client_company_id);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const posting = { ...data, company_name: data.m_client_companies?.name || null };
    delete posting.m_client_companies;
    return res.status(200).json({ posting });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const cid = body.client_company_id;
    if (!cid) return res.status(400).json({ error: "client_company_id は必須です" });
    if (!body.title?.trim()) return res.status(400).json({ error: "ポジション名は必須です" });
    try {
      await assertCompanyAccess(cid);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const status = VALID_STATUS.includes(body.status) ? body.status : "active";
    const row = {
      organization_id: ctx.member.organization_id,
      client_company_id: cid,
      title: body.title.trim(),
      job_posting: body.job_posting || null,
      status,
      created_by_member_id: ctx.member.id,
      updated_by_member_id: ctx.member.id,
    };
    const { data, error } = await supabase
      .from("t_job_postings")
      .insert(row)
      .select(POSTING_FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ posting: data });
  }

  if (req.method === "PATCH" && id) {
    const { data: found, error: findErr } = await supabase
      .from("t_job_postings")
      .select("id, client_company_id")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!found) return res.status(404).json({ error: "募集ポジションが見つかりません" });
    try {
      await assertCompanyAccess(found.client_company_id);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }

    const body = req.body || {};
    const update = { updated_by_member_id: ctx.member.id, updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      if (!String(body.title).trim()) return res.status(400).json({ error: "ポジション名は必須です" });
      update.title = body.title.trim();
    }
    if (body.job_posting !== undefined) update.job_posting = body.job_posting || null;
    if (body.status !== undefined && VALID_STATUS.includes(body.status)) update.status = body.status;

    const { data, error } = await supabase
      .from("t_job_postings")
      .update(update)
      .eq("id", id)
      .select(POSTING_FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ posting: data });
  }

  if (req.method === "DELETE" && id) {
    const { data: found } = await supabase
      .from("t_job_postings")
      .select("id, client_company_id")
      .eq("id", id)
      .maybeSingle();
    if (!found) return res.status(404).json({ error: "募集ポジションが見つかりません" });
    try {
      await assertCompanyAccess(found.client_company_id);
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const { error } = await supabase.from("t_job_postings").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
