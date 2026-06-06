/** AgentDump Mobile — API クライアント */
const MobileAPI = {
  LIFF_ID: "",
  lineToken: null,
  sessionToken: null,
  me: null,
  _cache: new Map(),
  _inflight: new Map(),
  _cacheTtl: 60000,

  setSessionToken(token) {
    if (token === this.sessionToken) return;
    this.sessionToken = token;
    if (token) sessionStorage.setItem("agentdump_session", token);
    else sessionStorage.removeItem("agentdump_session");
  },

  restoreSession() {
    const s = sessionStorage.getItem("agentdump_session");
    if (s) this.sessionToken = s;
  },

  setLineToken(token) {
    this.lineToken = token;
  },

  bearerToken(useLineToken = false) {
    if (useLineToken) {
      try {
        return this.lineToken || liff.getAccessToken();
      } catch {
        return this.lineToken;
      }
    }
    return this.sessionToken || this.lineToken || (typeof liff !== "undefined" ? liff.getAccessToken() : null);
  },

  authHeader(useLineToken = false) {
    const token = this.bearerToken(useLineToken);
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  invalidateList() {
    this._cache.clear();
    this._inflight.clear();
    if (typeof MobilePanels !== "undefined") MobilePanels.markAllStale();
  },

  invalidatePaths(prefixes) {
    if (!prefixes?.length) {
      this.invalidateList();
      return;
    }
    for (const key of [...this._cache.keys()]) {
      if (prefixes.some((p) => key.startsWith(p))) this._cache.delete(key);
    }
    for (const key of [...this._inflight.keys()]) {
      if (prefixes.some((p) => key.startsWith(p))) this._inflight.delete(key);
    }
    if (typeof MobilePanels !== "undefined") MobilePanels.markStale(prefixes);
  },

  _getCache(path) {
    const entry = this._cache.get(path);
    if (!entry) return null;
    if (Date.now() > entry.exp) {
      this._cache.delete(path);
      return null;
    }
    return entry.data;
  },

  _setCache(path, data) {
    this._cache.set(path, { data, exp: Date.now() + this._cacheTtl });
  },

  async cachedRequest(path, options = {}) {
    const cached = this._getCache(path);
    if (cached) return cached;
    if (this._inflight.has(path)) return this._inflight.get(path);

    const promise = this.request(path, options).then((data) => {
      this._setCache(path, data);
      this._inflight.delete(path);
      return data;
    }).catch((err) => {
      this._inflight.delete(path);
      throw err;
    });
    this._inflight.set(path, promise);
    return promise;
  },

  async request(path, options = {}) {
    const useLineToken = !!options.useLineToken;
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeader(useLineToken),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  async loadConfig() {
    const cached = sessionStorage.getItem("agentdump_liff_id");
    if (cached) {
      this.LIFF_ID = cached;
      return { liffId: cached };
    }
    const cfg = await fetch("/api/config").then((r) => r.json());
    this.LIFF_ID = cfg.liffId || new URLSearchParams(location.search).get("liffId") || "";
    if (this.LIFF_ID) sessionStorage.setItem("agentdump_liff_id", this.LIFF_ID);
    return cfg;
  },

  async authMe() {
    if (this.sessionToken) {
      try {
        return await this.request("/api/auth/me");
      } catch (_) {
        sessionStorage.removeItem("agentdump_session");
        this.sessionToken = null;
      }
    }
    return this.request("/api/auth/me", { useLineToken: true });
  },
  async activateInvite(code) {
    const data = await this.request("/api/auth/activate", {
      method: "POST",
      body: JSON.stringify({ invite: code }),
      useLineToken: true,
    });
    this.invalidatePaths(["/api/auth/me", "/api/dashboard", "/api/tasks"]);
    return data;
  },
  async orgSetup(body) {
    const data = await this.request("/api/org/setup", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/org", "/api/dashboard"]);
    return data;
  },
  orgTree() { return this.request("/api/org/tree"); },
  orgInvite(body) { return this.request("/api/org/invite", { method: "POST", body: JSON.stringify(body) }); },
  orgMembers() { return this.request("/api/org/members"); },
  messages() { return this.request("/api/messages"); },
  chat(message) { return this.request("/api/chat", { method: "POST", body: JSON.stringify({ message }) }); },
  tasks(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const path = `/api/tasks${qs ? `?${qs}` : ""}`;
    return qs ? this.request(path) : this.cachedRequest(path);
  },
  async completeTask(id, result) {
    const data = await this.request("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "complete", result: result || null }),
    });
    this.invalidatePaths(["/api/tasks"]);
    return data;
  },
  async updateTask(body) {
    const data = await this.request("/api/tasks", { method: "PATCH", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/tasks"]);
    return data;
  },
  async deleteTask(id) {
    const data = await this.request(`/api/tasks?id=${id}`, { method: "DELETE" });
    this.invalidatePaths(["/api/tasks"]);
    return data;
  },
  async createTask(body) {
    const data = await this.request("/api/tasks", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/tasks"]);
    return data;
  },
  suggestCategories(content) {
    return this.request("/api/suggest-categories", { method: "POST", body: JSON.stringify({ content }) });
  },
  companies(filters) {
    const f = typeof filters === "string" ? { q: filters } : (filters || {});
    const params = new URLSearchParams();
    ["q", "area", "salary", "job_type", "keyword"].forEach((key) => {
      const v = String(f[key] || "").trim();
      if (v) params.set(key, v);
    });
    const qs = params.toString();
    const path = `/api/client-companies${qs ? `?${qs}` : ""}`;
    return qs ? this.request(path) : this.cachedRequest(path);
  },
  company(id) { return this.request(`/api/client-companies?id=${id}`); },
  async createCompany(body) {
    const data = await this.request("/api/client-companies", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/client-companies"]);
    return data;
  },
  parseCompanyText(content) { return this.request("/api/parse-company", { method: "POST", body: JSON.stringify({ content }) }); },
  parseCompanyContacts(body) { return this.request("/api/parse-company-contacts", { method: "POST", body: JSON.stringify(body) }); },
  parseJobSeekerText(content) { return this.request("/api/parse-job-seeker", { method: "POST", body: JSON.stringify({ content }) }); },
  jobPostings(companyId) { return this.request(`/api/job-postings?client_company_id=${companyId}`); },
  jobPosting(id) { return this.request(`/api/job-postings?id=${id}`); },
  async createJobPosting(body) {
    const data = await this.request("/api/job-postings", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/job-postings", "/api/client-companies"]);
    return data;
  },
  async updateJobPosting(id, body) {
    const data = await this.request(`/api/job-postings?id=${id}`, { method: "PATCH", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/job-postings", "/api/client-companies"]);
    return data;
  },
  async deleteJobPosting(id) {
    const data = await this.request(`/api/job-postings?id=${id}`, { method: "DELETE" });
    this.invalidatePaths(["/api/job-postings", "/api/client-companies"]);
    return data;
  },
  async updateCompany(id, body) {
    const data = await this.request(`/api/client-companies?id=${id}`, { method: "PATCH", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/client-companies"]);
    return data;
  },
  async deleteCompany(id) {
    const data = await this.request(`/api/client-companies?id=${id}`, { method: "DELETE" });
    this.invalidatePaths(["/api/client-companies"]);
    return data;
  },
  memos(companyId) { return this.request(`/api/company-memos?companyId=${companyId}`); },
  createMemo(companyId, body) {
    return this.request(`/api/company-memos?companyId=${companyId}`, { method: "POST", body: JSON.stringify(body) });
  },
  updateMemo(id, body) { return this.request(`/api/company-memos?id=${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  deleteMemo(id) { return this.request(`/api/company-memos?id=${id}`, { method: "DELETE" }); },
  jobSeekers(q) {
    const path = `/api/job-seekers${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    return q ? this.request(path) : this.cachedRequest(path);
  },
  jobSeeker(id) { return this.request(`/api/job-seekers?id=${id}`); },
  async createJobSeeker(body) {
    const data = await this.request("/api/job-seekers", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/job-seekers"]);
    return data;
  },
  async updateJobSeeker(id, body) {
    const data = await this.request(`/api/job-seekers?id=${id}`, { method: "PATCH", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/job-seekers"]);
    return data;
  },
  async deleteJobSeeker(id) {
    const data = await this.request(`/api/job-seekers?id=${id}`, { method: "DELETE" });
    this.invalidatePaths(["/api/job-seekers"]);
    return data;
  },
  uploadPdf(jobSeekerId, type, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await MobileAPI.request("/api/upload", {
            method: "POST",
            body: JSON.stringify({
              jobSeekerId,
              type,
              fileName: file.name,
              contentBase64: reader.result.split(",")[1],
            }),
          });
          resolve(data);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  insights() { return this.cachedRequest("/api/insights"); },
  async createInsight(body) {
    const data = await this.request("/api/insights", { method: "POST", body: JSON.stringify(body) });
    this.invalidatePaths(["/api/insights"]);
    return data;
  },
  exportInsights() { return this.request("/api/export-insights", { method: "POST", body: "{}" }); },
  orgSettings() { return this.request("/api/org/settings"); },
  saveOrgSettings(body) { return this.request("/api/org/settings", { method: "PATCH", body: JSON.stringify(body) }); },
  memberPreferences() { return this.request("/api/member/preferences"); },
  saveMemberPreferences(body) { return this.request("/api/member/preferences", { method: "PATCH", body: JSON.stringify(body) }); },
  testLineNotification() { return this.request("/api/member/preferences", { method: "POST", body: JSON.stringify({}) }); },
  async transcribe(blob) {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const data = await this.request("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || "audio/webm" }),
    });
    return (data.text || "").trim();
  },
};

MobileAPI.restoreSession();

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showSheet(html, onClose) {
  const overlay = document.getElementById("sheet-overlay");
  document.getElementById("sheet-content").innerHTML = html;
  overlay.classList.remove("hidden");
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      if (onClose) onClose();
    }
  };
}

function closeSheet() {
  document.getElementById("sheet-overlay").classList.add("hidden");
}

function employmentLabel(s) {
  if (s === "employed") return "現職あり";
  if (s === "retired") return "退職済み";
  return "—";
}

function driveLink(id) {
  if (!id) return "—";
  return `<a href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener" class="panel-link">Drive</a>`;
}

function showToast(msg, ms = 3000) {
  let el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), ms);
}
