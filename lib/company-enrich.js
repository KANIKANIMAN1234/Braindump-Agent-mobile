const COMPANY_LIST_FIELDS =
  "id, name, company_culture, internal_notes, hr_name, hr_phone, hr_email, dept_manager_name, dept_manager_phone, dept_manager_email, window_contact_name, window_contact_phone, window_contact_email, created_at, updated_at";

const COMPANY_LIST_LIGHT = "id, name, created_at, updated_at";

const DASHBOARD_COMPANY_FIELDS = COMPANY_LIST_LIGHT;

async function enrichWithPostingCounts(supabase, companies) {
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

module.exports = {
  enrichWithPostingCounts,
  COMPANY_LIST_FIELDS,
  COMPANY_LIST_LIGHT,
  DASHBOARD_COMPANY_FIELDS,
};
