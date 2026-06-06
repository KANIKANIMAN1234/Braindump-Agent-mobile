const { applyTasksScope, applyClientCompaniesScope, applyJobSeekersScope } = require("./data-scope");
const { enrichTasks, TASK_SELECT } = require("./task-enrich");
const { enrichWithPostingCounts, DASHBOARD_COMPANY_FIELDS } = require("./company-enrich");

const DASHBOARD_SEEKER_FIELDS = "id, member_id, name, updated_at";

function isOrgMember(ctx) {
  return !ctx.legacy && !!(ctx.member?.organization_id || ctx.organization?.id);
}

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

  let companyQueryPromise = Promise.resolve({ data: [], error: null });
  if (isOrgMember(ctx)) {
    let companyQuery = supabase
      .from("m_client_companies")
      .select(DASHBOARD_COMPANY_FIELDS)
      .order("name", { ascending: true });
    companyQuery = applyClientCompaniesScope(companyQuery, ctx);
    companyQueryPromise = companyQuery;
  }

  let seekerQuery = supabase
    .from("m_job_seekers")
    .select(DASHBOARD_SEEKER_FIELDS)
    .order("updated_at", { ascending: false });
  const seekerQueryPromise = applyJobSeekersScope(seekerQuery, ctx, supabase);

  const [taskResult, companyResult, seekerResult] = await Promise.all([
    taskQuery,
    companyQueryPromise,
    seekerQueryPromise,
  ]);

  if (taskResult.error) throw taskResult.error;
  if (companyResult.error) throw companyResult.error;
  if (seekerResult.error) throw seekerResult.error;

  const tasks = await enrichTasks(supabase, taskResult.data || []);
  let companies = [];
  if (isOrgMember(ctx)) {
    companies = await enrichWithPostingCounts(supabase, companyResult.data || []);
  }
  const jobSeekers = await enrichSeekersWithMemberNames(supabase, ctx, seekerResult.data || []);

  return { tasks, companies, jobSeekers };
}

module.exports = { fetchDashboardData };
