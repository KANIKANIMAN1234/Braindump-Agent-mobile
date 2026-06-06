const TASK_SELECT =
  "id, title, due_date, priority, completed, result, client_company_id, job_posting_id, job_seeker_id, member_id, created_at";

async function enrichTasks(supabase, tasks) {
  if (!tasks?.length) return [];
  const companyIds = [...new Set(tasks.map((t) => t.client_company_id).filter(Boolean))];
  const postingIds = [...new Set(tasks.map((t) => t.job_posting_id).filter(Boolean))];
  const seekerIds = [...new Set(tasks.map((t) => t.job_seeker_id).filter(Boolean))];
  const companyMap = {};
  const postingMap = {};
  const seekerMap = {};

  if (companyIds.length) {
    const { data } = await supabase.from("m_client_companies").select("id, name").in("id", companyIds);
    (data || []).forEach((c) => { companyMap[c.id] = c.name; });
  }
  if (postingIds.length) {
    const { data } = await supabase
      .from("t_job_postings")
      .select("id, title, client_company_id")
      .in("id", postingIds);
    (data || []).forEach((p) => {
      postingMap[p.id] = { title: p.title, companyId: p.client_company_id };
    });
  }
  if (seekerIds.length) {
    const { data } = await supabase.from("m_job_seekers").select("id, name").in("id", seekerIds);
    (data || []).forEach((s) => { seekerMap[s.id] = s.name; });
  }

  return tasks.map((t) => {
    const posting = t.job_posting_id ? postingMap[t.job_posting_id] : null;
    const companyName = t.client_company_id
      ? companyMap[t.client_company_id] || "—"
      : posting
        ? companyMap[posting.companyId] || "—"
        : null;
    return {
      ...t,
      company_name: companyName,
      posting_title: posting?.title || null,
      job_seeker_name: t.job_seeker_id ? seekerMap[t.job_seeker_id] || "—" : null,
    };
  });
}

module.exports = { enrichTasks, TASK_SELECT };
