/** AgentDump Mobile — パネル画面（企業・転職者・気づき・設定） */
const MobilePanels = {
  isOrgMember() {
    return MobileAPI.me && !MobileAPI.me.legacy;
  },

  panelHeader(title, actionHtml = "") {
    const actions = actionHtml ? `<div class="panel-header-actions">${actionHtml}</div>` : "";
    return `<div class="panel-header"><h2>${escapeHtml(title)}</h2>${actions}</div>`;
  },

  async render(view) {
    const map = {
      companies: () => this.renderCompanies(),
      seekers: () => this.renderSeekers(),
      tasks: () => this.renderTasks(),
      insights: () => this.renderInsights(),
      settings: () => this.renderSettings(),
    };
    const el = document.getElementById(`view-${view}`);
    if (!el || !map[view]) return;
    el.innerHTML = `<div class="panel-loading">読み込み中...</div>`;
    try {
      await map[view](el);
    } catch (e) {
      el.innerHTML = `<div class="panel-empty panel-error">${escapeHtml(e.message)}</div>`;
    }
  },

  async renderCompanies(el) {
    if (!this.isOrgMember()) {
      el.innerHTML = this.panelHeader("採用企業") + `<div class="panel-empty">法人メンバー登録後に利用できます</div>`;
      return;
    }
    el.innerHTML =
      this.panelHeader("採用企業", `
        <button type="button" class="panel-btn" id="btn-bulk-company">📋 一括</button>
        <button type="button" class="panel-btn" id="btn-add-company">＋ 追加</button>`) +
      `<div class="panel-search"><input type="search" id="company-q" placeholder="企業名で検索" /></div>` +
      `<div id="company-list" class="panel-list"></div>`;

    const load = async (q) => {
      const { companies } = await MobileAPI.companies(q);
      const list = document.getElementById("company-list");
      if (!companies.length) {
        list.innerHTML = `<div class="panel-empty">採用企業がありません</div>`;
        return;
      }
      list.innerHTML = companies.map((c) => `
        <button type="button" class="panel-card" data-id="${c.id}">
          <strong>${escapeHtml(c.name)}</strong>
          <small>ポジション ${c.active_posting_count ?? c.posting_count ?? 0}件 · ${(c.updated_at || c.created_at || "").slice(0, 10)}</small>
        </button>`).join("");
      list.querySelectorAll(".panel-card").forEach((btn) => {
        btn.addEventListener("click", () => this.showCompanyDetail(btn.dataset.id));
      });
    };

    document.getElementById("btn-add-company").onclick = () => this.showCompanyForm(null, load);
    document.getElementById("btn-bulk-company").onclick = () => this.showCompanyBulkImport(load);
    document.getElementById("company-q").addEventListener("input", (e) => load(e.target.value));
    await load("");
  },

  companyFormHtml(c = {}) {
    return `
      <div class="sheet-title">${c.id ? "企業を編集" : "企業を登録"}</div>
      <label class="field"><span>企業名 *</span><input name="name" value="${escapeHtml(c.name || "")}" required /></label>
      <label class="field"><span>企業文化</span><textarea name="company_culture">${escapeHtml(c.company_culture || "")}</textarea></label>
      <label class="field"><span>内部メモ</span><textarea name="internal_notes">${escapeHtml(c.internal_notes || "")}</textarea></label>
      <label class="field"><span>人事担当</span><input name="hr_name" value="${escapeHtml(c.hr_name || "")}" /></label>
      <label class="field"><span>人事 TEL / メール</span>
        <input name="hr_phone" placeholder="TEL" value="${escapeHtml(c.hr_phone || "")}" />
        <input name="hr_email" type="email" placeholder="メール" value="${escapeHtml(c.hr_email || "")}" style="margin-top:6px" />
      </label>
      <label class="field"><span>部署責任者</span><input name="dept_manager_name" value="${escapeHtml(c.dept_manager_name || "")}" /></label>
      <label class="field"><span>責任者 TEL / メール</span>
        <input name="dept_manager_phone" placeholder="TEL" value="${escapeHtml(c.dept_manager_phone || "")}" />
        <input name="dept_manager_email" type="email" placeholder="メール" value="${escapeHtml(c.dept_manager_email || "")}" style="margin-top:6px" />
      </label>
      <label class="field"><span>窓口担当</span><input name="window_contact_name" value="${escapeHtml(c.window_contact_name || "")}" /></label>
      <label class="field"><span>窓口 TEL / メール</span>
        <input name="window_contact_phone" placeholder="TEL" value="${escapeHtml(c.window_contact_phone || "")}" />
        <input name="window_contact_email" type="email" placeholder="メール" value="${escapeHtml(c.window_contact_email || "")}" style="margin-top:6px" />
      </label>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        ${c.id ? `<button type="button" class="panel-btn danger" id="del-company">削除</button>` : ""}
        <button type="button" class="panel-btn primary" id="sheet-save">保存</button>
      </div>`;
  },

  async showCompanyForm(id, reload, preset = null) {
    let c = preset || {};
    if (id) {
      c = (await MobileAPI.company(id)).company;
      delete c.postings;
    }
    showSheet(this.companyFormHtml(c));
    if (id) {
      document.getElementById("del-company").onclick = async () => {
        if (!confirm("この採用企業を削除しますか？")) return;
        try {
          await MobileAPI.deleteCompany(id);
          closeSheet();
          showToast("削除しました");
          reload("");
        } catch (e) { alert(e.message); }
      };
    }
    document.getElementById("sheet-save").onclick = async () => {
      const sheet = document.getElementById("sheet-content");
      const body = {};
      sheet.querySelectorAll("[name]").forEach((el) => { body[el.name] = el.value; });
      try {
        if (id) await MobileAPI.updateCompany(id, body);
        else await MobileAPI.createCompany(body);
        closeSheet();
        showToast("保存しました");
        reload("");
      } catch (e) { alert(e.message); }
    };
  },

  showCompanyBulkImport(reload) {
    let parsedEntries = [];
    showSheet(`
      <div class="sheet-title">テキストから一括登録</div>
      <p class="hint">AI が<strong>企業マスタ</strong>と<strong>募集ポジション</strong>に分割します。</p>
      <label class="field"><span>原文テキスト</span>
        <textarea id="bulk-source" rows="8" placeholder="採用募集要項・求人票など"></textarea>
      </label>
      <button type="button" class="panel-btn primary" id="bulk-parse" style="margin-bottom:12px">AIで解析</button>
      <div id="bulk-preview"></div>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        <button type="button" class="panel-btn primary" id="bulk-save" disabled>0件のポジションを登録</button>
      </div>
    `);

    const saveBtn = document.getElementById("bulk-save");
    const previewEl = () => document.getElementById("bulk-preview");

    function flatPositions() {
      const rows = [];
      parsedEntries.forEach((entry, ei) => {
        (entry.positions || []).forEach((pos, pi) => rows.push({ ei, pi, entry, pos }));
      });
      return rows;
    }

    function updateSaveLabel() {
      const n = previewEl().querySelectorAll(".bulk-pos-check:checked").length;
      saveBtn.disabled = n === 0;
      saveBtn.textContent = `${n}件のポジションを登録`;
    }

    function renderPreview() {
      const flat = flatPositions();
      if (!flat.length) {
        previewEl().innerHTML = "";
        saveBtn.disabled = true;
        saveBtn.textContent = "0件のポジションを登録";
        return;
      }
      previewEl().innerHTML = `
        <p class="hint" style="margin-bottom:8px">解析結果: ${parsedEntries.length}社 / ${flat.length}ポジション</p>
        ${parsedEntries.map((entry, ei) => `
          <div class="panel-card static" style="margin-bottom:8px">
            <strong>${escapeHtml(entry.company.name)}</strong>
            ${(entry.positions || []).map((pos, pi) => `
              <label style="display:flex;gap:8px;align-items:flex-start;margin-top:6px">
                <input type="checkbox" class="bulk-pos-check" data-ei="${ei}" data-pi="${pi}" checked style="margin-top:4px" />
                <span><strong>${escapeHtml(pos.title)}</strong><br>
                <small>${escapeHtml((pos.job_posting || "—").slice(0, 80))}${(pos.job_posting || "").length > 80 ? "…" : ""}</small></span>
              </label>`).join("")}
          </div>`).join("")}`;
      previewEl().querySelectorAll(".bulk-pos-check").forEach((cb) => {
        cb.addEventListener("change", updateSaveLabel);
      });
      updateSaveLabel();
    }

    async function findOrCreateCompany(companyData) {
      const { companies } = await MobileAPI.companies(companyData.name);
      const exact = (companies || []).find((c) => c.name === companyData.name);
      if (exact) return exact.id;
      const { company } = await MobileAPI.createCompany(companyData);
      return company.id;
    }

    document.getElementById("bulk-parse").onclick = async () => {
      const content = document.getElementById("bulk-source").value.trim();
      if (!content) { showToast("テキストを貼り付けてください"); return; }
      const btn = document.getElementById("bulk-parse");
      btn.disabled = true;
      btn.textContent = "解析中…";
      try {
        const data = await MobileAPI.parseCompanyText(content);
        parsedEntries = data.entries || [];
        renderPreview();
        showToast(`${data.entryCount || parsedEntries.length}社・${data.positionCount || flatPositions().length}ポジションを抽出`);
      } catch (e) { alert(e.message); }
      finally {
        btn.disabled = false;
        btn.textContent = "AIで解析";
      }
    };
    saveBtn.onclick = async () => {
      const checks = [...previewEl().querySelectorAll(".bulk-pos-check:checked")];
      if (!checks.length) return;
      saveBtn.disabled = true;
      const companyCache = {};
      let ok = 0;
      try {
        for (const cb of checks) {
          const ei = Number(cb.dataset.ei);
          const pi = Number(cb.dataset.pi);
          const entry = parsedEntries[ei];
          const pos = entry?.positions?.[pi];
          if (!entry || !pos) continue;
          if (!companyCache[entry.company.name]) {
            companyCache[entry.company.name] = await findOrCreateCompany(entry.company);
          }
          await MobileAPI.createJobPosting({
            client_company_id: companyCache[entry.company.name],
            title: pos.title,
            job_posting: pos.job_posting,
          });
          ok++;
        }
        closeSheet();
        showToast(`${ok}件のポジションを登録しました`);
        reload("");
      } catch (e) {
        alert(e.message);
        saveBtn.disabled = false;
      }
    };
  },

  async showCompanyDetail(id) {
    const [{ company }, { memos }] = await Promise.all([MobileAPI.company(id), MobileAPI.memos(id)]);
    const postings = company.postings || [];
    showSheet(`
      <div class="sheet-title">${escapeHtml(company.name)}</div>
      <div class="detail-block"><strong>企業文化</strong><p>${escapeHtml(company.company_culture || "—")}</p></div>
      <div class="detail-block"><strong>内部メモ</strong><p>${escapeHtml(company.internal_notes || "—")}</p></div>
      <div class="detail-grid">
        <div><small>人事</small><br>${escapeHtml(company.hr_name || "—")}</div>
        <div><small>人事連絡</small><br>${escapeHtml(company.hr_phone || "—")}<br>${escapeHtml(company.hr_email || "—")}</div>
        <div><small>部署責任者</small><br>${escapeHtml(company.dept_manager_name || "—")}</div>
        <div><small>窓口</small><br>${escapeHtml(company.window_contact_name || "—")}</div>
      </div>
      <div class="detail-block">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>募集ポジション (${postings.length})</strong>
          <button type="button" class="panel-btn" id="btn-add-posting">＋ 追加</button>
        </div>
        ${postings.length ? postings.map((p) => `
          <button type="button" class="panel-card" data-posting-id="${p.id}" style="width:100%;margin-bottom:6px;text-align:left">
            <strong>${escapeHtml(p.title)}</strong>
            <small>${escapeHtml(p.status || "active")}</small>
          </button>`).join("") : "<p>—</p>"}
      </div>
      <div class="detail-block"><strong>メモ (${memos.length})</strong>
        ${memos.map((m) => `
          <div class="memo-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <small>${escapeHtml(m.created_by_name)} · ${(m.created_at || "").slice(0, 10)}</small>
              <button type="button" class="panel-btn danger" style="padding:4px 8px;font-size:10px" data-delete-memo="${m.id}">削除</button>
            </div>
            ${m.title ? `<strong style="display:block;margin:4px 0">${escapeHtml(m.title)}</strong>` : ""}
            <p>${escapeHtml(m.content)}</p>
          </div>`).join("") || "<p>—</p>"}
      </div>
      <label class="field"><span>メモタイトル</span><input id="new-memo-title" placeholder="（任意）" /></label>
      <label class="field"><span>メモ追加</span><textarea id="new-memo"></textarea></label>
      <div class="sheet-actions">
        <button type="button" class="panel-btn danger" id="del-co">削除</button>
        <button type="button" class="panel-btn" onclick="closeSheet()">閉じる</button>
        <button type="button" class="panel-btn" id="edit-co">編集</button>
        <button type="button" class="panel-btn primary" id="add-memo">メモ保存</button>
      </div>
    `);
    document.getElementById("btn-add-posting").onclick = () => {
      closeSheet();
      this.showPostingForm(id);
    };
    document.querySelectorAll("[data-posting-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeSheet();
        this.showPostingDetail(id, btn.dataset.postingId);
      });
    });
    document.getElementById("del-co").onclick = async () => {
      if (!confirm("この採用企業を削除しますか？")) return;
      try {
        await MobileAPI.deleteCompany(id);
        closeSheet();
        showToast("削除しました");
        this.render("companies");
      } catch (e) { alert(e.message); }
    };
    document.querySelectorAll("[data-delete-memo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("このメモを削除しますか？")) return;
        try {
          await MobileAPI.deleteMemo(btn.dataset.deleteMemo);
          showToast("メモを削除しました");
          closeSheet();
          this.showCompanyDetail(id);
        } catch (e) { alert(e.message); }
      });
    });
    document.getElementById("edit-co").onclick = () => {
      closeSheet();
      this.showCompanyForm(id, () => this.render("companies"));
    };
    document.getElementById("add-memo").onclick = async () => {
      const content = document.getElementById("new-memo").value.trim();
      if (!content) return;
      const title = document.getElementById("new-memo-title").value.trim();
      try {
        await MobileAPI.createMemo(id, { content, title: title || null });
        showToast("メモを保存しました");
        closeSheet();
        this.showCompanyDetail(id);
      } catch (e) { alert(e.message); }
    };
  },

  async showPostingForm(companyId, postingId) {
    let p = { title: "", job_posting: "", status: "active" };
    if (postingId) p = (await MobileAPI.jobPosting(postingId)).posting;
    showSheet(`
      <div class="sheet-title">${postingId ? "ポジション編集" : "ポジション追加"}</div>
      <label class="field"><span>ポジション名 *</span><input name="title" value="${escapeHtml(p.title || "")}" required /></label>
      <label class="field"><span>採用募集要項</span><textarea name="job_posting">${escapeHtml(p.job_posting || "")}</textarea></label>
      <label class="field"><span>状態</span>
        <select name="status">
          <option value="active" ${p.status === "active" ? "selected" : ""}>active</option>
          <option value="draft" ${p.status === "draft" ? "selected" : ""}>draft</option>
          <option value="closed" ${p.status === "closed" ? "selected" : ""}>closed</option>
        </select>
      </label>
      <div class="sheet-actions">
        ${postingId ? `<button type="button" class="panel-btn danger" id="del-posting">削除</button>` : ""}
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        <button type="button" class="panel-btn primary" id="save-posting">保存</button>
      </div>
    `);
    if (postingId) {
      document.getElementById("del-posting").onclick = async () => {
        if (!confirm("この募集ポジションを削除しますか？")) return;
        try {
          await MobileAPI.deleteJobPosting(postingId);
          closeSheet();
          showToast("削除しました");
          this.showCompanyDetail(companyId);
        } catch (e) { alert(e.message); }
      };
    }
    document.getElementById("save-posting").onclick = async () => {
      const sheet = document.getElementById("sheet-content");
      const body = {
        title: sheet.querySelector("[name=title]").value,
        job_posting: sheet.querySelector("[name=job_posting]").value,
        status: sheet.querySelector("[name=status]").value,
      };
      try {
        if (postingId) await MobileAPI.updateJobPosting(postingId, body);
        else await MobileAPI.createJobPosting({ ...body, client_company_id: companyId });
        closeSheet();
        showToast("保存しました");
        this.showCompanyDetail(companyId);
      } catch (e) { alert(e.message); }
    };
  },

  async showPostingDetail(companyId, postingId) {
    const { posting } = await MobileAPI.jobPosting(postingId);
    showSheet(`
      <div class="sheet-title">${escapeHtml(posting.title)}</div>
      <div class="detail-block"><strong>状態</strong> ${escapeHtml(posting.status || "active")}</div>
      <div class="detail-block"><strong>採用募集要項</strong><p style="white-space:pre-wrap">${escapeHtml(posting.job_posting || "—")}</p></div>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">閉じる</button>
        <button type="button" class="panel-btn primary" id="edit-posting">編集</button>
      </div>
    `);
    document.getElementById("edit-posting").onclick = () => {
      closeSheet();
      this.showPostingForm(companyId, postingId);
    };
  },

  async renderSeekers(el) {
    el.innerHTML =
      this.panelHeader("転職者", `<button type="button" class="panel-btn" id="btn-add-seeker">＋ 追加</button>`) +
      `<div class="panel-search"><input type="search" id="seeker-q" placeholder="氏名で検索" /></div>` +
      `<div id="seeker-list" class="panel-list"></div>`;

    const showAssignee = MobileAPI.me?.isAdmin;
    const load = async (q) => {
      const { jobSeekers } = await MobileAPI.jobSeekers(q);
      const list = document.getElementById("seeker-list");
      if (!jobSeekers.length) {
        list.innerHTML = `<div class="panel-empty">転職者がありません</div>`;
        return;
      }
      list.innerHTML = jobSeekers.map((j) => `
        <button type="button" class="panel-card" data-id="${j.id}">
          <strong>${escapeHtml(j.name)}</strong>
          <small>${employmentLabel(j.employment_status)} · ${escapeHtml(j.desired_job_type || "—")}${showAssignee && j.assignee_name ? ` · ${escapeHtml(j.assignee_name)}` : ""}</small>
        </button>`).join("");
      list.querySelectorAll(".panel-card").forEach((btn) => {
        btn.addEventListener("click", () => this.showSeekerDetail(btn.dataset.id, load));
      });
    };

    document.getElementById("btn-add-seeker").onclick = () => this.showSeekerForm(null, load);
    document.getElementById("seeker-q").addEventListener("input", (e) => load(e.target.value));
    await load("");
  },

  seekerFormHtml(j = {}) {
    return `
      <div class="sheet-title">${j.id ? "転職者を編集" : "転職者を登録"}</div>
      <label class="field"><span>氏名 *</span><input name="name" value="${escapeHtml(j.name || "")}" required /></label>
      <label class="field"><span>年齢</span><input name="age" type="number" value="${j.age ?? ""}" /></label>
      <label class="field"><span>現年収（万円）</span><input name="current_salary_man" type="number" value="${j.current_salary_man ?? ""}" /></label>
      <label class="field"><span>希望年収（万円）</span><input name="desired_salary_man" type="number" value="${j.desired_salary_man ?? ""}" /></label>
      <label class="field"><span>就業状況</span>
        <select name="employment_status">
          <option value="">—</option>
          <option value="employed" ${j.employment_status === "employed" ? "selected" : ""}>現職あり</option>
          <option value="retired" ${j.employment_status === "retired" ? "selected" : ""}>退職済み</option>
        </select>
      </label>
      <label class="field"><span>現職</span><input name="current_company" value="${escapeHtml(j.current_company || "")}" /></label>
      <label class="field"><span>転職希望時期</span><input name="desired_timing" value="${escapeHtml(j.desired_timing || "")}" /></label>
      <label class="field"><span>転職希望職種</span><input name="desired_job_type" value="${escapeHtml(j.desired_job_type || "")}" /></label>
      <label class="field"><span>メモ</span><textarea name="notes">${escapeHtml(j.notes || "")}</textarea></label>
      ${j.id ? `
      <label class="field"><span>履歴書 PDF</span><input type="file" accept="application/pdf" id="resume-file" /></label>
      <label class="field"><span>職務経歴書 PDF</span><input type="file" accept="application/pdf" id="cv-file" /></label>` : ""}
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        ${j.id ? `<button type="button" class="panel-btn danger" id="del-seeker">削除</button>` : ""}
        <button type="button" class="panel-btn primary" id="sheet-save">保存</button>
      </div>`;
  },

  async showSeekerForm(id, reload) {
    let j = {};
    if (id) j = (await MobileAPI.jobSeeker(id)).jobSeeker;
    showSheet(this.seekerFormHtml(j));
    if (id) {
      document.getElementById("del-seeker").onclick = async () => {
        if (!confirm("削除しますか？")) return;
        try {
          await MobileAPI.deleteJobSeeker(id);
          closeSheet();
          reload("");
        } catch (e) { alert(e.message); }
      };
    }
    document.getElementById("sheet-save").onclick = async () => {
      const sheet = document.getElementById("sheet-content");
      const body = {};
      sheet.querySelectorAll("[name]").forEach((el) => { body[el.name] = el.value; });
      try {
        let sid = id;
        if (id) await MobileAPI.updateJobSeeker(id, body);
        else sid = (await MobileAPI.createJobSeeker(body)).jobSeeker.id;
        const rf = document.getElementById("resume-file")?.files?.[0];
        const cf = document.getElementById("cv-file")?.files?.[0];
        if (rf) await MobileAPI.uploadPdf(sid, "resume", rf);
        if (cf) await MobileAPI.uploadPdf(sid, "cv", cf);
        closeSheet();
        reload("");
      } catch (e) { alert(e.message); }
    };
  },

  async showSeekerDetail(id, reload) {
    const { jobSeeker: j } = await MobileAPI.jobSeeker(id);
    showSheet(`
      <div class="sheet-title">${escapeHtml(j.name)}</div>
      <div class="detail-grid">
        <div><small>年齢</small><br>${j.age ?? "—"}</div>
        <div><small>就業</small><br>${employmentLabel(j.employment_status)}</div>
        <div><small>現年収</small><br>${j.current_salary_man != null ? j.current_salary_man + "万" : "—"}</div>
        <div><small>希望年収</small><br>${j.desired_salary_man != null ? j.desired_salary_man + "万" : "—"}</div>
        <div class="full"><small>現職</small><br>${escapeHtml(j.current_company || "—")}</div>
        <div class="full"><small>希望時期 / 職種</small><br>${escapeHtml(j.desired_timing || "—")} / ${escapeHtml(j.desired_job_type || "—")}</div>
        <div><small>履歴書</small><br>${driveLink(j.resume_drive_file_id)} ${j.resume_file_name ? `(${escapeHtml(j.resume_file_name)})` : ""}</div>
        <div><small>職務経歴書</small><br>${driveLink(j.cv_drive_file_id)} ${j.cv_file_name ? `(${escapeHtml(j.cv_file_name)})` : ""}</div>
        <div class="full"><small>メモ</small><br>${escapeHtml(j.notes || "—")}</div>
      </div>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">閉じる</button>
        <button type="button" class="panel-btn primary" id="edit-seeker">編集</button>
      </div>
    `);
    document.getElementById("edit-seeker").onclick = () => {
      closeSheet();
      this.showSeekerForm(id, reload);
    };
  },

  async renderTasks(el) {
    el.innerHTML =
      this.panelHeader("タスク", `<button type="button" class="panel-btn" id="btn-add-task">＋ 追加</button>`) +
      `<div id="task-list" class="panel-list"></div>`;

    let companies = [];
    let seekers = [];
    if (this.isOrgMember()) {
      try { companies = (await MobileAPI.companies()).companies || []; } catch (_) {}
    }
    try { seekers = (await MobileAPI.jobSeekers()).jobSeekers || []; } catch (_) {}

    const load = async () => {
      const { tasks } = await MobileAPI.tasks();
      const list = document.getElementById("task-list");
      if (!tasks.length) {
        list.innerHTML = `<div class="panel-empty">タスクがありません</div>`;
        return;
      }
      list.innerHTML = tasks.map((t) => `
        <button type="button" class="panel-card" data-id="${t.id}">
          <strong>${escapeHtml(t.title)}</strong>
          <small>${escapeHtml(t.priority || "中")} · ${t.due_date || "期限なし"} · ${escapeHtml(t.company_name || "—")}</small>
        </button>`).join("");
      list.querySelectorAll(".panel-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          const task = tasks.find((x) => x.id === btn.dataset.id);
          if (task) this.showTaskForm(task, companies, seekers, load);
        });
      });
    };

    document.getElementById("btn-add-task").onclick = () => this.showTaskForm(null, companies, seekers, load);
    await load();
  },

  showTaskForm(task, companies, seekers, reload) {
    const isEdit = !!task;
    const due = task?.due_date ? String(task.due_date).slice(0, 10) : "";
    const companyOptions = companies.length
      ? `<label class="field"><span>担当企業</span>
          <select name="client_company_id">
            <option value="">—</option>
            ${companies.map((c) => `<option value="${c.id}" ${task?.client_company_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select></label>`
      : "";
    showSheet(`
      <div class="sheet-title">${isEdit ? "タスクを編集" : "タスクを追加"}</div>
      <label class="field"><span>タスク内容 *</span><input name="title" value="${escapeHtml(task?.title || "")}" required /></label>
      ${companyOptions}
      <label class="field"><span>転職者</span>
        <select name="job_seeker_id">
          <option value="">—</option>
          ${seekers.map((s) => `<option value="${s.id}" ${task?.job_seeker_id === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span>期限</span><input name="due_date" type="date" value="${due}" /></label>
      <label class="field"><span>優先度</span>
        <select name="priority">
          ${["高", "中", "低"].map((p) => `<option value="${p}" ${(task?.priority || "中") === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </label>
      <div class="sheet-actions">
        ${isEdit ? `<button type="button" class="panel-btn danger" id="del-task">削除</button>` : ""}
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        ${isEdit ? `<button type="button" class="panel-btn" id="complete-task">完了</button>` : ""}
        <button type="button" class="panel-btn primary" id="sheet-save">保存</button>
      </div>
    `);
    if (isEdit) {
      document.getElementById("del-task").onclick = async () => {
        if (!confirm("このタスクを削除しますか？")) return;
        try {
          await MobileAPI.deleteTask(task.id);
          closeSheet();
          showToast("タスクを削除しました");
          reload();
        } catch (e) { alert(e.message); }
      };
      document.getElementById("complete-task").onclick = async () => {
        const result = prompt("結果・成果（空欄でスキップ）");
        if (result === null) return;
        try {
          await MobileAPI.completeTask(task.id, result.trim() || null);
          closeSheet();
          showToast("タスクを完了しました");
          reload();
        } catch (e) { alert(e.message); }
      };
    }
    document.getElementById("sheet-save").onclick = async () => {
      const sheet = document.getElementById("sheet-content");
      const body = { title: sheet.querySelector("[name=title]").value };
      ["client_company_id", "job_seeker_id", "due_date", "priority"].forEach((f) => {
        const el = sheet.querySelector(`[name=${f}]`);
        if (el) body[f] = el.value || null;
      });
      try {
        if (isEdit) {
          body.id = task.id;
          await MobileAPI.updateTask(body);
          showToast("タスクを更新しました");
        } else {
          await MobileAPI.createTask(body);
          showToast("タスクを追加しました");
        }
        closeSheet();
        reload();
      } catch (e) { alert(e.message); }
    };
  },

  async renderInsights(el) {
    el.innerHTML =
      this.panelHeader("気づき", `
        <button type="button" class="panel-btn" id="btn-add-insight">＋ 追加</button>
        <button type="button" class="panel-btn" id="btn-export-ins">📤 出力</button>`) +
      `<div id="insight-list" class="panel-list"></div>`;

    const load = async () => {
      const { insights } = await MobileAPI.insights();
      const list = document.getElementById("insight-list");
      if (!insights.length) {
        list.innerHTML = `<div class="panel-empty">気づきがありません<br><small>チャットタブから追加できます</small></div>`;
        return;
      }
      list.innerHTML = insights.map((i) => `
        <div class="panel-card static">
          <small>${(i.created_at || "").slice(0, 16).replace("T", " ")} ${i.exported_at ? "· 出力済" : ""}</small>
          <p>${escapeHtml(i.content)}</p>
          ${i.tags ? `<small class="hint">#${escapeHtml(i.tags)}</small>` : ""}
        </div>`).join("");
    };

    document.getElementById("btn-add-insight").onclick = () => {
      showSheet(`
        <div class="sheet-title">気づきを追加</div>
        <label class="field"><span>内容 *</span><textarea id="insight-content"></textarea></label>
        <label class="field"><span>タグ（カンマ区切り）</span><input id="insight-tags" /></label>
        <div class="sheet-actions">
          <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
          <button type="button" class="panel-btn primary" id="save-insight">保存</button>
        </div>
      `);
      document.getElementById("save-insight").onclick = async () => {
        const content = document.getElementById("insight-content").value.trim();
        if (!content) return;
        try {
          await MobileAPI.createInsight({
            content,
            tags: document.getElementById("insight-tags").value.trim() || null,
          });
          closeSheet();
          showToast("保存しました");
          load();
        } catch (e) { alert(e.message); }
      };
    };
    document.getElementById("btn-export-ins").onclick = async () => {
      try {
        const res = await MobileAPI.exportInsights();
        alert(res.message || `${res.count || 0}件を Google Drive に出力しました`);
        load();
      } catch (e) { alert(e.message); }
    };
    await load();
  },

  async renderSettings(el) {
    if (!this.isOrgMember()) {
      el.innerHTML = this.panelHeader("設定") + `<div class="panel-empty">法人メンバー登録後に利用できます</div>`;
      return;
    }
    const { settings } = await MobileAPI.orgSettings();
    const canEdit = MobileAPI.me?.member?.role === "org_admin";
    el.innerHTML =
      this.panelHeader("設定") +
      `<div class="panel-card static">
        <strong>Google Drive フォルダ ID</strong>
        <p class="hint">サービスアカウントにフォルダを共有してください</p>
        <input id="drive-folder" value="${escapeHtml(settings.google_drive_folder_id || "")}" ${canEdit ? "" : "disabled"} />
        ${canEdit ? `<button type="button" class="panel-btn primary" id="save-drive" style="margin-top:12px">保存</button>` : `<p class="hint">org_admin のみ編集可</p>`}
      </div>`;
    if (canEdit) {
      document.getElementById("save-drive").onclick = async () => {
        try {
          await MobileAPI.saveOrgSettings({
            google_drive_folder_id: document.getElementById("drive-folder").value,
            google_drive_enabled: true,
          });
          alert("保存しました");
        } catch (e) { alert(e.message); }
      };
    }
  },
};

/** タブ切り替え */
const MobileNav = {
  current: "chat",

  init() {
    document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => this.switch(btn.dataset.view));
    });
  },

  switch(view) {
    this.current = view;
    document.querySelectorAll(".bottom-nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
    });
    document.getElementById("view-chat").classList.toggle("hidden", view !== "chat");
    ["companies", "seekers", "tasks", "insights", "settings"].forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle("hidden", view !== v);
    });
    if (view !== "chat") MobilePanels.render(view);
  },
};
