const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyJobSeekersScope, scopedRowData } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

const FIELDS =
  "id, member_id, name, age, current_salary_man, desired_salary_man, employment_status, current_company, desired_timing, desired_job_type, resume_drive_file_id, resume_file_name, cv_drive_file_id, cv_file_name, status, notes, created_at, updated_at";

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  const supabase = getSupabaseAdmin();
  const id = req.query.id;

  async function enrichWithMemberNames(rows) {
    if (!rows?.length || ctx.legacy) return rows;
    const memberIds = [...new Set(rows.map((r) => r.member_id))];
    const { data: members } = await supabase
      .from("m_members")
      .select("id, display_name")
      .in("id", memberIds);
    const map = {};
    (members || []).forEach((m) => {
      map[m.id] = m.display_name || "不明";
    });
    return rows.map((r) => ({
      ...r,
      assignee_name: map[r.member_id] || "不明",
    }));
  }

  if (req.method === "GET" && !id) {
    let query = supabase.from("m_job_seekers").select(FIELDS).order("updated_at", { ascending: false });
    query = await applyJobSeekersScope(query, ctx, supabase);
    const q = req.query.q;
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const enriched = await enrichWithMemberNames(data || []);
    return res.status(200).json({ jobSeekers: enriched });
  }

  if (req.method === "GET" && id) {
    let query = supabase.from("m_job_seekers").select(FIELDS).eq("id", id);
    query = await applyJobSeekersScope(query, ctx, supabase);
    const { data, error } = await query.maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "転職者が見つかりません" });
    const [enriched] = await enrichWithMemberNames([data]);
    return res.status(200).json({ jobSeeker: enriched });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.name?.trim()) return res.status(400).json({ error: "氏名は必須です" });

    const row = scopedRowData(ctx, {
      name: body.name.trim(),
      age: body.age != null && body.age !== "" ? Number(body.age) : null,
      current_salary_man: body.current_salary_man != null && body.current_salary_man !== "" ? Number(body.current_salary_man) : null,
      desired_salary_man: body.desired_salary_man != null && body.desired_salary_man !== "" ? Number(body.desired_salary_man) : null,
      employment_status: body.employment_status || null,
      current_company: body.current_company || null,
      desired_timing: body.desired_timing || null,
      desired_job_type: body.desired_job_type || null,
      status: body.status || "active",
      notes: body.notes || null,
    });

    const { data, error } = await supabase.from("m_job_seekers").insert(row).select(FIELDS).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ jobSeeker: data });
  }

  if (req.method === "PATCH" && id) {
    let findQ = supabase.from("m_job_seekers").select("id").eq("id", id);
    findQ = await applyJobSeekersScope(findQ, ctx, supabase);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "転職者が見つかりません" });

    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    const fields = [
      "name", "age", "current_salary_man", "desired_salary_man",
      "employment_status", "current_company", "desired_timing",
      "desired_job_type", "status", "notes",
      "resume_drive_file_id", "resume_file_name", "cv_drive_file_id", "cv_file_name",
    ];
    fields.forEach((f) => {
      if (body[f] !== undefined) {
        if (["age", "current_salary_man", "desired_salary_man"].includes(f)) {
          update[f] = body[f] != null && body[f] !== "" ? Number(body[f]) : null;
        } else {
          update[f] = body[f] || null;
        }
      }
    });

    const { data, error } = await supabase
      .from("m_job_seekers")
      .update(update)
      .eq("id", id)
      .select(FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ jobSeeker: data });
  }

  if (req.method === "DELETE" && id) {
    let findQ = supabase.from("m_job_seekers").select("id").eq("id", id);
    findQ = await applyJobSeekersScope(findQ, ctx, supabase);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "転職者が見つかりません" });
    const { error } = await supabase.from("m_job_seekers").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
