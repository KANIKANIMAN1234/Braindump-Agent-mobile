/** AgentDump Mobile — API クライアント */
const MobileAPI = {
  LIFF_ID: "",
  me: null,

  authHeader() {
    try {
      const token = liff.getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  },

  async request(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeader(),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  async loadConfig() {
    const cfg = await fetch("/api/config").then((r) => r.json());
    this.LIFF_ID = cfg.liffId || new URLSearchParams(location.search).get("liffId") || "";
    return cfg;
  },

  authMe() { return this.request("/api/auth/me"); },
  activateInvite(code) { return this.request("/api/auth/activate", { method: "POST", body: JSON.stringify({ invite: code }) }); },
  messages() { return this.request("/api/messages"); },
  chat(message) { return this.request("/api/chat", { method: "POST", body: JSON.stringify({ message }) }); },
  tasks(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/tasks${qs ? `?${qs}` : ""}`);
  },
  completeTask(id, result) {
    return this.request("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "complete", result: result || null }),
    });
  },
  createTask(body) { return this.request("/api/tasks", { method: "POST", body: JSON.stringify(body) }); },
  suggestCategories(content) {
    return this.request("/api/suggest-categories", { method: "POST", body: JSON.stringify({ content }) });
  },
  companies(q) { return this.request(`/api/client-companies${q ? `?q=${encodeURIComponent(q)}` : ""}`); },
  company(id) { return this.request(`/api/client-companies?id=${id}`); },
  createCompany(body) { return this.request("/api/client-companies", { method: "POST", body: JSON.stringify(body) }); },
  updateCompany(id, body) { return this.request(`/api/client-companies?id=${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  memos(companyId) { return this.request(`/api/company-memos?companyId=${companyId}`); },
  createMemo(companyId, body) {
    return this.request(`/api/company-memos?companyId=${companyId}`, { method: "POST", body: JSON.stringify(body) });
  },
  jobSeekers(q) { return this.request(`/api/job-seekers${q ? `?q=${encodeURIComponent(q)}` : ""}`); },
  jobSeeker(id) { return this.request(`/api/job-seekers?id=${id}`); },
  createJobSeeker(body) { return this.request("/api/job-seekers", { method: "POST", body: JSON.stringify(body) }); },
  updateJobSeeker(id, body) { return this.request(`/api/job-seekers?id=${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  deleteJobSeeker(id) { return this.request(`/api/job-seekers?id=${id}`, { method: "DELETE" }); },
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
  insights() { return this.request("/api/insights"); },
  createInsight(body) { return this.request("/api/insights", { method: "POST", body: JSON.stringify(body) }); },
  exportInsights() { return this.request("/api/export-insights", { method: "POST", body: "{}" }); },
  orgSettings() { return this.request("/api/org/settings"); },
  saveOrgSettings(body) { return this.request("/api/org/settings", { method: "PATCH", body: JSON.stringify(body) }); },
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
