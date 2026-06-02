/** AgentDump Mobile — パネル画面（企業・転職者・気づき・設定） */
const MobilePanels = {
  isOrgMember() {
    return MobileAPI.me && !MobileAPI.me.legacy;
  },

  panelHeader(title, actionHtml = "") {
    return `<div class="panel-header"><h2>${escapeHtml(title)}</h2>${actionHtml}</div>`;
  },

  async render(view) {
    const map = {
      companies: () => this.renderCompanies(),
      seekers: () => this.renderSeekers(),
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
      this.panelHeader("採用企業", `<button type="button" class="panel-btn" id="btn-add-company">＋ 追加</button>`) +
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
          <small>${(c.updated_at || c.created_at || "").slice(0, 10)}</small>
        </button>`).join("");
      list.querySelectorAll(".panel-card").forEach((btn) => {
        btn.addEventListener("click", () => this.showCompanyDetail(btn.dataset.id));
      });
    };

    document.getElementById("btn-add-company").onclick = () => this.showCompanyForm(null, load);
    document.getElementById("company-q").addEventListener("input", (e) => load(e.target.value));
    await load("");
  },

  companyFormHtml(c = {}) {
    return `
      <div class="sheet-title">${c.id ? "企業を編集" : "企業を登録"}</div>
      <label class="field"><span>企業名 *</span><input name="name" value="${escapeHtml(c.name || "")}" required /></label>
      <label class="field"><span>採用募集要項</span><textarea name="job_posting">${escapeHtml(c.job_posting || "")}</textarea></label>
      <label class="field"><span>企業文化</span><textarea name="company_culture">${escapeHtml(c.company_culture || "")}</textarea></label>
      <label class="field"><span>内部メモ</span><textarea name="internal_notes">${escapeHtml(c.internal_notes || "")}</textarea></label>
      <label class="field"><span>人事担当</span><input name="hr_name" value="${escapeHtml(c.hr_name || "")}" /></label>
      <label class="field"><span>人事 TEL / メール</span>
        <input name="hr_phone" placeholder="TEL" value="${escapeHtml(c.hr_phone || "")}" />
        <input name="hr_email" type="email" placeholder="メール" value="${escapeHtml(c.hr_email || "")}" style="margin-top:6px" />
      </label>
      <label class="field"><span>部署責任者</span><input name="dept_manager_name" value="${escapeHtml(c.dept_manager_name || "")}" /></label>
      <label class="field"><span>窓口担当</span><input name="window_contact_name" value="${escapeHtml(c.window_contact_name || "")}" /></label>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">キャンセル</button>
        <button type="button" class="panel-btn primary" id="sheet-save">保存</button>
      </div>`;
  },

  async showCompanyForm(id, reload) {
    let c = {};
    if (id) c = (await MobileAPI.company(id)).company;
    showSheet(this.companyFormHtml(c));
    document.getElementById("sheet-save").onclick = async () => {
      const sheet = document.getElementById("sheet-content");
      const body = {};
      sheet.querySelectorAll("[name]").forEach((el) => { body[el.name] = el.value; });
      try {
        if (id) await MobileAPI.updateCompany(id, body);
        else await MobileAPI.createCompany(body);
        closeSheet();
        reload("");
      } catch (e) { alert(e.message); }
    };
  },

  async showCompanyDetail(id) {
    const [{ company }, { memos }] = await Promise.all([MobileAPI.company(id), MobileAPI.memos(id)]);
    showSheet(`
      <div class="sheet-title">${escapeHtml(company.name)}</div>
      <div class="detail-block"><strong>募集要項</strong><p>${escapeHtml(company.job_posting || "—")}</p></div>
      <div class="detail-block"><strong>企業文化</strong><p>${escapeHtml(company.company_culture || "—")}</p></div>
      <div class="detail-block"><strong>メモ (${memos.length})</strong>
        ${memos.map((m) => `
          <div class="memo-card">
            <small>${escapeHtml(m.created_by_name)} · ${(m.created_at || "").slice(0, 10)}</small>
            <p>${escapeHtml(m.content)}</p>
          </div>`).join("") || "<p>—</p>"}
      </div>
      <label class="field"><span>メモ追加</span><textarea id="new-memo"></textarea></label>
      <div class="sheet-actions">
        <button type="button" class="panel-btn" onclick="closeSheet()">閉じる</button>
        <button type="button" class="panel-btn" id="edit-co">編集</button>
        <button type="button" class="panel-btn primary" id="add-memo">メモ保存</button>
      </div>
    `);
    document.getElementById("edit-co").onclick = () => {
      closeSheet();
      this.showCompanyForm(id, () => this.render("companies"));
    };
    document.getElementById("add-memo").onclick = async () => {
      const content = document.getElementById("new-memo").value.trim();
      if (!content) return;
      try {
        await MobileAPI.createMemo(id, { content });
        closeSheet();
        this.showCompanyDetail(id);
      } catch (e) { alert(e.message); }
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
        <div><small>履歴書</small><br>${driveLink(j.resume_drive_file_id)}</div>
        <div><small>職務経歴書</small><br>${driveLink(j.cv_drive_file_id)}</div>
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

  async renderInsights(el) {
    el.innerHTML =
      this.panelHeader("気づき", `<button type="button" class="panel-btn" id="btn-export-ins">📤 出力</button>`) +
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
        </div>`).join("");
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
    ["companies", "seekers", "insights", "settings"].forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle("hidden", view !== v);
    });
    if (view !== "chat") MobilePanels.render(view);
  },
};
