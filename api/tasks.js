const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyTasksScope, scopedRowData } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

const TASK_SELECT =
  "id, title, due_date, priority, completed, result, client_company_id, job_seeker_id, member_id, created_at";

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (!ctx.legacy && ctx.needsOrgSetup && ctx.member.role === "org_admin") {
    return res.status(403).json({
      error: "先に組織階層の設定を完了してください",
    });
  }

  const supabase = getSupabaseAdmin();

  async function enrichTasks(tasks) {
    if (!tasks?.length) return [];
    const companyIds = [...new Set(tasks.map((t) => t.client_company_id).filter(Boolean))];
    const seekerIds = [...new Set(tasks.map((t) => t.job_seeker_id).filter(Boolean))];
    let companyMap = {};
    let seekerMap = {};
    if (companyIds.length) {
      const { data } = await supabase.from("m_client_companies").select("id, name").in("id", companyIds);
      (data || []).forEach((c) => { companyMap[c.id] = c.name; });
    }
    if (seekerIds.length) {
      const { data } = await supabase.from("m_job_seekers").select("id, name").in("id", seekerIds);
      (data || []).forEach((s) => { seekerMap[s.id] = s.name; });
    }
    return tasks.map((t) => ({
      ...t,
      company_name: t.client_company_id ? companyMap[t.client_company_id] || "—" : null,
      job_seeker_name: t.job_seeker_id ? seekerMap[t.job_seeker_id] || "—" : null,
    }));
  }

  if (req.method === "GET") {
    let query = supabase
      .from("t_tasks")
      .select(TASK_SELECT)
      .or("completed.eq.false,completed.is.null")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    query = applyTasksScope(query, ctx);

    if (req.query.client_company_id) {
      query = query.eq("client_company_id", req.query.client_company_id);
    }
    if (req.query.job_seeker_id) {
      query = query.eq("job_seeker_id", req.query.job_seeker_id);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const tasks = await enrichTasks(data || []);
    return res.status(200).json({ tasks });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.title?.trim()) return res.status(400).json({ error: "タスク内容は必須です" });
    const validPriorities = ["高", "中", "低"];
    const priority = validPriorities.includes(body.priority) ? body.priority : "中";
    const row = scopedRowData(ctx, {
      title: body.title.trim(),
      due_date: body.due_date || null,
      priority,
      client_company_id: body.client_company_id || null,
      job_seeker_id: body.job_seeker_id || null,
    }, { withOrgUnit: true });
    const { data, error } = await supabase.from("t_tasks").insert(row).select(TASK_SELECT).single();
    if (error) return res.status(500).json({ error: error.message });
    const [enriched] = await enrichTasks([data]);
    return res.status(201).json({ task: enriched });
  }

  if (req.method === "PATCH") {
    const body = req.body || {};
    const { id, action, result, priority, due_date, title } = body;
    if (!id) return res.status(400).json({ error: "id は必須です" });

    let findQuery = supabase.from("t_tasks").select("id, title").eq("id", id);
    findQuery = applyTasksScope(findQuery, ctx);
    const { data: tasks, error: findError } = await findQuery;
    if (findError) return res.status(500).json({ error: findError.message });
    if (!tasks?.length) return res.status(404).json({ error: "タスクが見つかりません" });

    const updateData = {};
    if (action === "complete") {
      updateData.completed = true;
      if (result) updateData.result = result;
    } else {
      if (priority !== undefined) {
        const validPriorities = ["高", "中", "低"];
        if (validPriorities.includes(priority)) updateData.priority = priority;
      }
      if (due_date !== undefined) {
        updateData.due_date = due_date === "" || due_date === "なし" ? null : due_date;
      }
      if (title !== undefined) updateData.title = title;
      if (body.client_company_id !== undefined) updateData.client_company_id = body.client_company_id || null;
      if (body.job_seeker_id !== undefined) updateData.job_seeker_id = body.job_seeker_id || null;
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({ error: "更新内容がありません" });
    }

    const { data, error: updateError } = await supabase
      .from("t_tasks")
      .update(updateData)
      .eq("id", id)
      .select(TASK_SELECT)
      .single();
    if (updateError) return res.status(500).json({ error: updateError.message });
    const [enriched] = await enrichTasks([data]);
    return res.status(200).json({ task: enriched });
  }

  if (req.method === "DELETE") {
    const id = req.query.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "id は必須です" });
    let findQuery = supabase.from("t_tasks").select("id").eq("id", id);
    findQuery = applyTasksScope(findQuery, ctx);
    const { data: tasks } = await findQuery;
    if (!tasks?.length) return res.status(404).json({ error: "タスクが見つかりません" });
    const { error } = await supabase.from("t_tasks").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
