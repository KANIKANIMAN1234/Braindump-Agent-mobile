function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function includesText(haystack, needle) {
  const n = norm(needle);
  if (!n) return true;
  return norm(haystack).includes(n);
}

function companySearchText(company) {
  return [company.name, company.company_culture, company.internal_notes].filter(Boolean).join(" ");
}

function postingMatchesFilters(posting, company, filters) {
  const text = posting.job_posting || "";
  const title = posting.title || "";
  const { area, salary, job_type, keyword } = filters;

  if (area && !includesText(text, area)) return false;
  if (salary && !includesText(text, salary)) return false;
  if (job_type && !includesText(title, job_type) && !includesText(text, job_type)) return false;
  if (keyword) {
    const companyText = companySearchText(company);
    if (
      !includesText(text, keyword) &&
      !includesText(title, keyword) &&
      !includesText(companyText, keyword)
    ) {
      return false;
    }
  }
  return true;
}

function hasPostingFilters(filters) {
  return !!(filters.area || filters.salary || filters.job_type || filters.keyword);
}

function filterCompaniesByPostings(companies, postings, filters) {
  if (!hasPostingFilters(filters)) return companies;

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
  const matchingIds = new Set();

  (postings || []).forEach((p) => {
    const company = companyMap[p.client_company_id];
    if (company && postingMatchesFilters(p, company, filters)) {
      matchingIds.add(p.client_company_id);
    }
  });

  if (filters.keyword && !filters.area && !filters.salary && !filters.job_type) {
    companies.forEach((c) => {
      if (includesText(companySearchText(c), filters.keyword)) matchingIds.add(c.id);
    });
  }

  return companies.filter((c) => matchingIds.has(c.id));
}

module.exports = { filterCompaniesByPostings, hasPostingFilters };
