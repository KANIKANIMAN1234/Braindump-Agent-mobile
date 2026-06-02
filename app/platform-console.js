const SECRET_KEY = "braindump_platform_secret";

function getSecret() {
  return sessionStorage.getItem(SECRET_KEY) || "";
}

function setSecret(value) {
  sessionStorage.setItem(SECRET_KEY, value);
}

function platformHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Platform-Secret": getSecret(),
  };
}

function showError(msg) {
  const el = document.getElementById("global-error");
  el.textContent = msg;
  el.hidden = !msg;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...platformHeaders(), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showPanels() {
  document.getElementById("org-form-section").hidden = false;
  document.getElementById("invite-section").hidden = false;
  document.getElementById("list-section").hidden = false;
}

function formatOrgDepth(depth) {
  if (depth == null) return "未設定";
  const labels = {
    0: "0段（代表のみ）",
    1: "1段（部門のみ）",
    2: "2段（本部→部門）",
    3: "3段（本部→課→部門）",
  };
  return labels[depth] || String(depth);
}

function extractInviteInfo(data) {
  const invite =
    data?.representativeInvite?.invite ||
    data?.invite ||
    null;
  if (!invite?.invite_url) return null;
  const member =
    data?.representativeInvite?.member || data?.member || null;
  return {
    url: invite.invite_url,
    displayName: member?.display_name || "—",
    role: member?.role || "—",
    expiresAt: invite.expires_at || null,
  };
}

function renderInviteHighlight(boxId, info) {
  const box = document.getElementById(boxId);
  if (!box || !info) return;

  const expires = info.expiresAt
    ? new Date(info.expiresAt).toLocaleString("ja-JP")
    : "—";

  box.hidden = false;
  box.innerHTML = `
    <h3>📩 招待 URL（この URL を代表者に送ってください）</h3>
    <div class="invite-url-row">
      <input type="text" class="invite-url-input" id="${boxId}-url" readonly value="" />
      <button type="button" class="btn-copy" data-copy-target="${boxId}-url">コピー</button>
    </div>
    <p class="invite-meta">
      招待先: <strong>${escapeHtml(info.displayName)}</strong>（${escapeHtml(info.role)}）<br />
      有効期限: ${escapeHtml(expires)}（7日間・1回限り）
    </p>
  `;

  const input = document.getElementById(`${boxId}-url`);
  input.value = info.url;

  box.querySelector(".btn-copy").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById(btn.dataset.copyTarget);
    try {
      await navigator.clipboard.writeText(target.value);
      btn.textContent = "コピーしました";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "コピー";
        btn.classList.remove("copied");
      }, 2000);
    } catch {
      target.select();
      document.execCommand("copy");
      btn.textContent = "コピーしました";
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function showApiResult({ areaId, boxId, preId, data }) {
  const area = document.getElementById(areaId);
  const box = document.getElementById(boxId);
  const pre = document.getElementById(preId);

  area.hidden = false;
  pre.textContent = JSON.stringify(data, null, 2);

  const info = extractInviteInfo(data);
  if (info) {
    renderInviteHighlight(boxId, info);
  } else if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
}

async function loadOrganizations() {
  const data = await api("/api/platform/organizations");
  const list = document.getElementById("org-list");
  const select = document.getElementById("invite-org-select");

  list.innerHTML = "";
  select.innerHTML = "";

  (data.organizations || []).forEach((org) => {
    const div = document.createElement("div");
    div.className = "org-item";
    div.innerHTML = `
      <strong>${org.name}</strong>
      <span>ID: ${org.id}</span><br />
      状態: ${org.status} / 階層: ${formatOrgDepth(org.org_structure_depth)}<br />
      ${org.postal_code || ""} ${org.address || ""}<br />
      TEL: ${org.phone || "—"}
    `;
    list.appendChild(div);

    const opt = document.createElement("option");
    opt.value = org.id;
    opt.textContent = `${org.name}（${org.status}）`;
    select.appendChild(opt);
  });

  if (!data.organizations?.length) {
    list.textContent = "登録された法人はまだありません。";
  }
}

document.getElementById("btn-save-secret").addEventListener("click", () => {
  const input = document.getElementById("platform-secret");
  const val = input.value.trim();
  if (!val) {
    showError("秘密鍵を入力してください");
    return;
  }
  setSecret(val);
  showError("");
  showPanels();
  loadOrganizations().catch((e) => showError(e.message));
});

document.getElementById("org-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const fd = new FormData(e.target);
  const body = {
    name: fd.get("name"),
    postal_code: fd.get("postal_code") || undefined,
    address: fd.get("address") || undefined,
    phone: fd.get("phone") || undefined,
  };
  const repName = (fd.get("rep_name") || "").trim();
  if (repName) {
    body.representative = { display_name: repName };
  }

  try {
    const data = await api("/api/platform/organizations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    showApiResult({
      areaId: "org-result-area",
      boxId: "org-invite-box",
      preId: "org-result",
      data,
    });
    e.target.reset();
    await loadOrganizations();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById("invite-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const organization_id = document.getElementById("invite-org-select").value;
  const display_name = document.getElementById("invite-rep-name").value.trim();

  try {
    const data = await api("/api/platform/invite-representative", {
      method: "POST",
      body: JSON.stringify({ organization_id, display_name }),
    });
    showApiResult({
      areaId: "invite-result-area",
      boxId: "invite-invite-box",
      preId: "invite-result",
      data,
    });
    await loadOrganizations();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById("btn-refresh").addEventListener("click", () => {
  loadOrganizations().catch((e) => showError(e.message));
});

if (getSecret()) {
  document.getElementById("platform-secret").value = getSecret();
  showPanels();
  loadOrganizations().catch((e) => showError(e.message));
}
