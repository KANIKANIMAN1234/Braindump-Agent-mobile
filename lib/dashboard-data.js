const { applyTasksScope, applyClientCompaniesScope } = require("./data-scope");
const { enrichTasks, TASK_SELECT } = require("./task-enrich");
const { enrichWithPostingCounts, COMPANY_LIST_FIELDS } = require("./company-enrich");

const SEEKER_FIELDS =
  "id, member_id, name, age, current_salary_man, desired_salary_man, employment_status, current_company, desired_timing, desired_job_type, resume_drive_file_id, resume_file_name, cv_drive_file_id, cv_file_name, status, notes, created_at, updated_at";

async function enrichSeekersWithMemberNames(supabase, ctx, rows) {
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

async function fetchDashboardData(supabase, ctx) {
  let taskQuery = supabase
    .from("t_tasks")
    .select(TASK_SELECT)
    .or("completed.eq.false,completed.is.null")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  taskQuery = applyTasksScope(taskQuery, ctx);

  const tasksPromise = taskQuery.then(async ({ data, error }) => {
    if (error) throw error;
    return enrichTasks(supabase, data || []);
  });

  let companiesPromise = Promise.resolve([]);
  if (!ctx.legacy) {
    let companyQuery = supabase
      .from("m_client_companies")
      .select(COMPANY_LIST_FIELDS)
      .order("name", { ascending: true });
    companyQuery = applyClientCompaniesScope(companyQuery, ctx);
    companiesPromise = companyQuery.then(async ({ data, error }) => {
      if (error) throw error;
      return enrichWithPostingCounts(supabase, data || []);
    });
  }

  const { applyJobSeekersScope } = require("./data-scope");
  let seekerQuery = supabase
    .from("m_job_seekers")
    .select(SEEKER_FIELDS)
    .order("updated_at", { ascending: false });
  seekerQuery = await applyJobSeekersScope(seekerQuery, ctx, supabase);
  const seekersPromise = seekerQuery.then(async ({ data, error }) => {
    if (error) throw error;
    return enrichSeekersWithMemberNames(supabase, ctx, data || []);
  });

  const [tasks, companies, jobSeekers] = await Promise.all([
    tasksPromise,
    companiesPromise,
    seekersPromise,
  ]);

  return { tasks, companies, jobSeekers };
}

module.exports = { fetchDashboardData };
