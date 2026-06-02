/**
 * Phase 2: 組織設定ウィザード・メンバー招待
 */
(function () {
  const overlay = document.getElementById("org-overlay");
  const panel = document.getElementById("org-panel");
  const btnAdmin = document.getElementById("btn-org-admin");

  let orgState = { depth: null, headquarters: [] };
  let currentSetupOrgName = "";

  function authHeader() {
    const token = typeof liff !== "undefined" ? liff.getAccessToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function orgApi(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function showOverlay(contentHtml) {
    if (!overlay || !panel) return;
    panel.innerHTML = contentHtml;
    overlay.removeAttribute("hidden");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      panel.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (panel) panel.innerHTML = "";
  }

  function bindOverlayBackdrop() {
    if (!overlay) return;
    overlay.addEventListener("click", (e) => {
      if (e.target !== overlay) return;
      if (document.getElementById("org-back")) {
        renderSetupStep1(currentSetupOrgName);
        return;
      }
      hideOverlay();
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function extractInviteFromResponse(data) {
    const invite = data?.invite || data?.representativeInvite?.invite;
    if (!invite?.invite_url) return null;
    const member = data?.member || data?.representativeInvite?.member;
    return {
      url: invite.invite_url,
      displayName: member?.display_name || "—",
      role: member?.role || "—",
      expiresAt: invite.expires_at || null,
    };
  }

  function showInviteApiResult(areaId, boxId, preId, data) {
    const area = document.getElementById(areaId);
    const box = document.getElementById(boxId);
    const pre = document.getElementById(preId);
    if (!area || !pre) return;

    area.hidden = false;
    pre.textContent = JSON.stringify(data, null, 2);

    const info = extractInviteFromResponse(data);
    if (!info || !box) return;

    const expires = info.expiresAt
      ? new Date(info.expiresAt).toLocaleString("ja-JP")
      : "—";

    box.hidden = false;
    box.innerHTML = `
      <p class="org-invite-title">📩 招待 URL（この URL を送付）</p>
      <div class="org-invite-url-row">
        <input type="text" class="org-invite-url-input" id="${boxId}-url" readonly />
        <button type="button" class="org-invite-copy" data-target="${boxId}-url">コピー</button>
      </div>
      <p class="org-invite-meta">招待先: <strong>${esc(info.displayName)}</strong>（${esc(info.role)}）<br />有効期限: ${esc(expires)}</p>
    `;
    const input = document.getElementById(`${boxId}-url`);
    input.value = info.url;
    box.querySelector(".org-invite-copy").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const el = document.getElementById(btn.dataset.target);
      try {
        await navigator.clipboard.writeText(el.value);
        btn.textContent = "コピー済";
      } catch {
        el.select();
        document.execCommand("copy");
        btn.textContent = "コピー済";
      }
    });
  }

  /* ── 組織設定ウィザード ── */
  function renderSetupStep1(orgName) {
    currentSetupOrgName = orgName;
    showOverlay(`
      <div class="org-panel-inner">
        <h2>組織階層の設定</h2>
        <p class="org-sub">${esc(orgName)} の組織構造を選んでください。</p>
        <div class="org-depth-btns">
          <button type="button" class="org-depth-btn" data-depth="0">0段<br><small>代表者のみ</small></button>
          <button type="button" class="org-depth-btn" data-depth="1">1段<br><small>部門のみ</small></button>
          <button type="button" class="org-depth-btn" data-depth="2">2段<br><small>本部→部門</small></button>
          <button type="button" class="org-depth-btn" data-depth="3">3段<br><small>本部→課→部門</small></button>
        </div>
        <button type="button" class="org-close-btn" id="org-setup-later">あとで</button>
      </div>
    `);
    panel.querySelectorAll(".org-depth-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        orgState.depth = Number(btn.dataset.depth);
        orgState.headquarters =
          orgState.depth === 0 ? [] : [{ name: "", departments: [""] }];
        renderSetupStep2(orgName);
      });
    });
    document.getElementById("org-setup-later")?.addEventListener("click", hideOverlay);
  }

  function renderSetupStep2(orgName) {
    currentSetupOrgName = orgName;
    const d = Number(orgState.depth);
    orgState.depth = d;
    let body = "";

    if (d === 0) {
      body = `
        <p class="org-solo-note">部門・部下の登録はありません。<strong>代表者（あなた）1名のみ</strong>で利用します。</p>
      `;
    } else if (d === 1) {
      body = `
        <label>部門名（複数可）</label>
        <div id="dept-list-1"></div>
        <button type="button" class="org-add-btn" id="add-dept-1">＋ 部門を追加</button>
      `;
    } else if (d === 2) {
      body = `<div id="hq-list-2"></div>
        <button type="button" class="org-add-btn" id="add-hq-2">＋ 本部を追加</button>`;
    } else if (d === 3) {
      body = `<div id="hq-list-3"></div>
        <button type="button" class="org-add-btn" id="add-hq-3">＋ 本部を追加</button>`;
    } else {
      orgState.depth = 1;
      return renderSetupStep2(orgName);
    }

    showOverlay(`
      <div class="org-panel-inner">
        <h2>${d === 0 ? "代表者のみの確認" : `組織名の入力（${d}段）`}</h2>
        <p class="org-sub">${esc(orgName)}</p>
        ${body}
        <label class="org-terms">
          <input type="checkbox" id="agreed-terms" />
          管理者は配下メンバーが登録した気づきの全文を業務管理上閲覧できることに同意します
        </label>
        <div class="org-actions">
          <button type="button" class="org-secondary" id="org-back">戻る</button>
          <button type="button" class="org-primary" id="org-submit">設定を保存</button>
        </div>
      </div>
    `);

    if (d === 1) initDeptList1();
    if (d === 2) initHqList2();
    if (d === 3) initHqList3();

    document.getElementById("org-back")?.addEventListener("click", () => renderSetupStep1(orgName));
    document.getElementById("org-submit")?.addEventListener("click", () => submitSetup(orgName));
  }

  function initDeptList1() {
    const wrap = document.getElementById("dept-list-1");
    if (!wrap) return;
    function addRow(val = "") {
      const row = document.createElement("div");
      row.className = "org-input-row";
      row.innerHTML = `<input type="text" class="dept-input" value="${esc(val)}" placeholder="部門名" />
        <button type="button" class="org-remove-btn">×</button>`;
      row.querySelector(".org-remove-btn").addEventListener("click", () => row.remove());
      wrap.appendChild(row);
    }
    addRow();
    document.getElementById("add-dept-1").addEventListener("click", () => addRow());
  }

  function initHqList2() {
    const wrap = document.getElementById("hq-list-2");
    if (!wrap) return;
    function render() {
      wrap.innerHTML = "";
      orgState.headquarters.forEach((hq, hi) => {
        const block = document.createElement("div");
        block.className = "org-block";
        block.innerHTML = `
          <label>本部名</label>
          <input type="text" class="hq-name" data-hi="${hi}" value="${esc(hq.name)}" placeholder="例：事業本部" />
          <label>部門</label>
          <div class="hq-depts" data-hi="${hi}"></div>
          <button type="button" class="org-add-btn add-dept" data-hi="${hi}">＋ 部門</button>
        `;
        wrap.appendChild(block);
        const deptWrap = block.querySelector(".hq-depts");
        (hq.departments || [""]).forEach((dn, di) => {
          const row = document.createElement("div");
          row.className = "org-input-row";
          row.innerHTML = `<input type="text" class="dept-name" data-hi="${hi}" data-di="${di}" value="${esc(dn)}" />
            <button type="button" class="org-remove-btn">×</button>`;
          row.querySelector(".org-remove-btn").addEventListener("click", () => {
            hq.departments.splice(di, 1);
            render();
          });
          deptWrap.appendChild(row);
        });
        block.querySelector(".add-dept").addEventListener("click", () => {
          hq.departments.push("");
          render();
        });
      });
    }
    render();
    document.getElementById("add-hq-2").addEventListener("click", () => {
      orgState.headquarters.push({ name: "", departments: [""] });
      render();
    });
  }

  function initHqList3() {
    const wrap = document.getElementById("hq-list-3");
    if (!wrap) return;
    if (!orgState.headquarters[0]) orgState.headquarters = [{ name: "", sections: [{ name: "", departments: [""] }] }];

    function render() {
      wrap.innerHTML = "";
      orgState.headquarters.forEach((hq, hi) => {
        if (!hq.sections) hq.sections = [{ name: "", departments: [""] }];
        const block = document.createElement("div");
        block.className = "org-block";
        block.innerHTML = `
          <label>本部名</label>
          <input type="text" class="hq-name" value="${esc(hq.name)}" placeholder="例：事業本部" />
          <div class="hq-sections" data-hi="${hi}"></div>
          <button type="button" class="org-add-btn add-sec" data-hi="${hi}">＋ 課を追加</button>
        `;
        const secWrap = block.querySelector(".hq-sections");
        hq.sections.forEach((sec, si) => {
          const secBlock = document.createElement("div");
          secBlock.className = "org-sub-block";
          secBlock.innerHTML = `
            <label>課・チーム名</label>
            <input type="text" class="sec-name" data-hi="${hi}" data-si="${si}" value="${esc(sec.name)}" />
            <div class="sec-depts" data-hi="${hi}" data-si="${si}"></div>
            <button type="button" class="org-add-btn add-dept3" data-hi="${hi}" data-si="${si}">＋ 部門</button>
          `;
          const deptWrap = secBlock.querySelector(".sec-depts");
          (sec.departments || [""]).forEach((dn, di) => {
            const row = document.createElement("div");
            row.className = "org-input-row";
            row.innerHTML = `<input type="text" class="dept-name" value="${esc(dn)}" />
              <button type="button" class="org-remove-btn">×</button>`;
            row.querySelector(".org-remove-btn").addEventListener("click", () => {
              sec.departments.splice(di, 1);
              render();
            });
            deptWrap.appendChild(row);
          });
          secBlock.querySelector(".add-dept3").addEventListener("click", () => {
            sec.departments.push("");
            render();
          });
          secWrap.appendChild(secBlock);
        });
        block.querySelector(".add-sec").addEventListener("click", () => {
          hq.sections.push({ name: "", departments: [""] });
          render();
        });
        wrap.appendChild(block);
      });
    }
    render();
    document.getElementById("add-hq-3").addEventListener("click", () => {
      orgState.headquarters.push({ name: "", sections: [{ name: "", departments: [""] }] });
      render();
    });
  }

  function collectSetupPayload() {
    const d = orgState.depth;
    if (d === 0) {
      return { depth: 0, agreed_terms: true };
    }
    if (d === 1) {
      const departments = [...panel.querySelectorAll(".dept-input")]
        .map((i) => i.value.trim())
        .filter(Boolean);
      return { depth: 1, departments, agreed_terms: true };
    }
    if (d === 2) {
      const headquarters = [...panel.querySelectorAll(".org-block")].map((block) => {
        const name = block.querySelector(".hq-name")?.value.trim() || "";
        const departments = [...block.querySelectorAll(".dept-name")]
          .map((i) => i.value.trim())
          .filter(Boolean);
        return { name, departments };
      });
      return { depth: 2, headquarters, agreed_terms: true };
    }
    const headquarters = orgState.headquarters.map((hq, hi) => {
      const block = panel.querySelectorAll(".org-block")[hi];
      const name = block?.querySelector(".hq-name")?.value.trim() || hq.name;
      const sections = [...(block?.querySelectorAll(".org-sub-block") || [])].map((secBlock, si) => {
        const secName = secBlock.querySelector(".sec-name")?.value.trim() || "";
        const departments = [...secBlock.querySelectorAll(".dept-name")]
          .map((i) => i.value.trim())
          .filter(Boolean);
        return { name: secName, departments };
      });
      return { name, sections };
    });
    return { depth: 3, headquarters, agreed_terms: true };
  }

  async function submitSetup(orgName) {
    if (!document.getElementById("agreed-terms")?.checked) {
      alert("利用規約への同意が必要です");
      return;
    }
    const submitBtn = document.getElementById("org-submit");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const payload = collectSetupPayload();
      payload.agreed_terms = true;
      await orgApi("/api/org/setup", { method: "POST", body: JSON.stringify(payload) });
      const savedDepth = orgState.depth;
      hideOverlay();
      window.dispatchEvent(
        new CustomEvent("org-setup-complete", { detail: { depth: savedDepth } })
      );
      if (savedDepth === 0) {
        alert("代表者のみの組織として設定が完了しました。");
        if (btnAdmin) btnAdmin.hidden = true;
        return;
      }
      alert("組織設定が完了しました。メンバーを招待できます。");
      renderInvitePanel(orgName);
    } catch (e) {
      alert(e.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /* ── 招待パネル ── */
  async function renderInvitePanel(orgName) {
    let treeData;
    try {
      treeData = await orgApi("/api/org/tree");
    } catch (e) {
      alert(e.message);
      return;
    }

    const units = treeData.invitableUnits || [];
    const unitOptions = units
      .map((u) => {
        const prefix = u.unit_type === "hq" ? "本部" : u.unit_type === "section" ? "課" : "部門";
        return `<option value="${u.id}">[${prefix}] ${esc(u.name)}</option>`;
      })
      .join("");

    const roleOptions =
      treeData.member.role === "org_admin"
        ? `<option value="unit_admin">本部管理者</option>
           <option value="dept_admin">部門管理者</option>
           <option value="member">メンバー</option>`
        : treeData.member.role === "unit_admin"
          ? `<option value="dept_admin">部門管理者</option>
             <option value="member">メンバー</option>`
          : `<option value="member">メンバー</option>`;

    showOverlay(`
      <div class="org-panel-inner">
        <h2>メンバー招待</h2>
        <p class="org-sub">${esc(orgName || treeData.organization?.name || "")}</p>
        <label>氏名 <input type="text" id="inv-name" placeholder="山田 太郎" /></label>
        <label>ロール <select id="inv-role">${roleOptions}</select></label>
        <label>所属組織 <select id="inv-unit">${unitOptions}</select></label>
        <button type="button" class="org-primary" id="inv-submit">招待 URL を発行</button>
        <div id="inv-result-area" class="org-invite-result-area" hidden>
          <div id="inv-invite-box" class="org-invite-highlight" hidden></div>
          <details class="org-result-details">
            <summary>レスポンス詳細（JSON）</summary>
            <pre id="inv-result" class="org-result"></pre>
          </details>
        </div>
        <hr />
        <h3>メンバー一覧</h3>
        <div id="member-list" class="org-member-list">読み込み中…</div>
        <button type="button" class="org-close-btn" id="org-close">閉じる</button>
      </div>
    `);

    document.getElementById("inv-submit").addEventListener("click", async () => {
      const display_name = document.getElementById("inv-name").value.trim();
      const role = document.getElementById("inv-role").value;
      const org_unit_id = document.getElementById("inv-unit").value;
      try {
        const data = await orgApi("/api/org/invite", {
          method: "POST",
          body: JSON.stringify({ display_name, role, org_unit_id }),
        });
        showInviteApiResult("inv-result-area", "inv-invite-box", "inv-result", data);
        loadMemberList();
      } catch (e) {
        alert(e.message);
      }
    });

    document.getElementById("org-close").addEventListener("click", hideOverlay);
    loadMemberList();
  }

  async function loadMemberList() {
    const el = document.getElementById("member-list");
    if (!el) return;
    try {
      const data = await orgApi("/api/org/members");
      el.innerHTML = (data.members || [])
        .map(
          (m) =>
            `<div class="org-member-item"><strong>${esc(m.display_name)}</strong>
              <span>${esc(m.role)} / ${esc(m.org_unit_name)} / ${esc(m.status)}</span></div>`
        )
        .join("") || "メンバーはいません";
    } catch (e) {
      el.textContent = e.message;
    }
  }

  let latestAuth = null;
  let setupWizardAutoShown = false;

  window.initOrgAdmin = function (authMe) {
    if (!authMe || authMe.legacy) return;
    latestAuth = authMe;

    function applyAdminVisibility(me) {
      const orgName = me.organization?.name || "";
      const isSoloOrg = me.organization?.org_structure_depth === 0;
      const showAdmin =
        me.needsOrgSetup ||
        (!isSoloOrg && me.member && me.member.role !== "member");

      if (!showAdmin) {
        btnAdmin.hidden = true;
        return orgName;
      }

      btnAdmin.hidden = false;
      btnAdmin.onclick = () => {
        if (latestAuth?.needsOrgSetup) {
          renderSetupStep1(orgName);
        } else {
          renderInvitePanel(orgName);
        }
      };
      return orgName;
    }

    const orgName = applyAdminVisibility(authMe);

    if (authMe.needsOrgSetup && !setupWizardAutoShown) {
      setupWizardAutoShown = true;
      setTimeout(() => renderSetupStep1(orgName), 500);
    }
  };

  bindOverlayBackdrop();

  window.addEventListener("org-setup-complete", async (ev) => {
    hideOverlay();
    latestAuth = latestAuth
      ? {
          ...latestAuth,
          needsOrgSetup: false,
          organization: {
            ...latestAuth.organization,
            status: "active",
            org_structure_depth: ev.detail?.depth ?? latestAuth.organization?.org_structure_depth,
          },
        }
      : latestAuth;
    if (latestAuth) window.initOrgAdmin(latestAuth);
  });
})();
