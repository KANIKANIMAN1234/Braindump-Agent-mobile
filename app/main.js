/* AgentDump Mobile — チャット・LIFF・ステートマシン */
let currentMember = null;
let currentOrganization = null;

const STATE = {
  IDLE: "idle",
  TASK_COMPANY: "task_company",
  TASK_SEEKER: "task_seeker",
  TASK_NAME: "task_name",
  TASK_DUE: "task_due",
  TASK_PRIORITY: "task_priority",
  TASK_COMPLETE_RESULT: "task_complete_result",
  TASK_UPDATE_DUE_DATE: "task_update_due_date",
  INSIGHT_CONTENT: "insight_content",
  INSIGHT_CATEGORY: "insight_category",
};

let currentState = STATE.IDLE;
let flowData = {};

const chatBody = () => document.getElementById("chat-body");
const userInput = () => document.getElementById("user-input");
const sendBtn = () => document.getElementById("send-btn");
const micBtn = () => document.getElementById("mic-btn");

function nowStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatMsgTime(iso) {
  if (!iso) return nowStr();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.length >= 16 ? iso.slice(11, 16) : nowStr();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatMsgDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function scrollBottom() {
  const el = chatBody();
  el.scrollTop = el.scrollHeight;
}

function addMessage(text, role, createdAt = null) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  if (role === "bot") {
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.textContent = "📋";
    wrap.appendChild(av);
  }
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = formatMsgTime(createdAt);
  if (role === "user") { wrap.appendChild(time); wrap.appendChild(bubble); }
  else { wrap.appendChild(bubble); wrap.appendChild(time); }
  chatBody().appendChild(wrap);
  scrollBottom();
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot typing";
  wrap.innerHTML = `<div class="msg-avatar">📋</div><div class="msg-bubble"><div class="dots"><span></span><span></span><span></span></div></div>`;
  chatBody().appendChild(wrap);
  scrollBottom();
  return wrap;
}

function addBotMessageWithButtons(text, buttons, onSelect, multiSelect = false) {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  const av = document.createElement("div");
  av.className = "msg-avatar";
  av.textContent = "📋";
  wrap.appendChild(av);
  const group = document.createElement("div");
  group.className = "msg-bubble-group";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  group.appendChild(bubble);
  const btnWrap = document.createElement("div");
  btnWrap.className = "choice-buttons";
  const selected = new Set();

  buttons.forEach(({ label, value, className }) => {
    const btn = document.createElement("button");
    btn.className = `choice-btn ${className || ""}`;
    btn.textContent = label;
    btn.dataset.value = value ?? label;
    if (multiSelect) {
      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
        if (btn.classList.contains("selected")) selected.add(btn.dataset.value);
        else selected.delete(btn.dataset.value);
      });
    } else {
      btn.addEventListener("click", () => {
        btnWrap.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
        btn.classList.add("selected");
        onSelect(btn.dataset.value);
      });
    }
    btnWrap.appendChild(btn);
  });

  group.appendChild(btnWrap);
  if (multiSelect) {
    const submitBtn = document.createElement("button");
    submitBtn.className = "choice-submit-btn";
    submitBtn.textContent = "決定";
    submitBtn.addEventListener("click", () => {
      btnWrap.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
      submitBtn.disabled = true;
      onSelect([...selected]);
    });
    group.appendChild(submitBtn);
  }
  wrap.appendChild(group);
  chatBody().appendChild(wrap);
  scrollBottom();
}

function addTaskListMessage(tasks) {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.innerHTML = `<div class="msg-avatar">📋</div>`;
  const group = document.createElement("div");
  group.className = "msg-bubble-group";
  const intro = document.createElement("div");
  intro.className = "msg-bubble";
  intro.textContent = tasks.length ? `未完了タスク ${tasks.length} 件📋` : "未完了タスクはありません🎉";
  group.appendChild(intro);
  if (tasks.length) {
    const list = document.createElement("div");
    list.className = "task-list-bubble";
    tasks.forEach((t) => {
      const item = document.createElement("div");
      item.className = "task-item";
      const p = t.priority || "中";
      const badge = document.createElement("span");
      badge.className = `priority-badge priority-badge-${p === "高" ? "high" : p === "中" ? "mid" : "low"}`;
      badge.textContent = p;
      const title = document.createElement("span");
      title.className = "task-item-title";
      const ctx = [t.company_name, t.job_seeker_name].filter(Boolean).join(" × ");
      title.textContent = ctx ? `${ctx} — ${t.title}` : t.title;
      item.appendChild(badge);
      item.appendChild(title);
      if (t.due_date) {
        const due = document.createElement("span");
        due.className = "task-item-due";
        due.textContent = t.due_date;
        item.appendChild(due);
      }
      list.appendChild(item);
    });
    group.appendChild(list);
  }
  wrap.appendChild(group);
  chatBody().appendChild(wrap);
  scrollBottom();
}

function formatTaskLabel(task) {
  const icon = task.priority === "高" ? "🔴" : task.priority === "中" ? "🟡" : "🔵";
  const ctx = [task.company_name, task.job_seeker_name].filter(Boolean).join("×");
  const prefix = ctx ? `${ctx} ` : "";
  return `${icon} ${prefix}${task.title}`;
}

async function callChat(message) {
  const typing = addTyping();
  try {
    const data = await MobileAPI.chat(message);
    typing.remove();
    if (data.tasks) addTaskListMessage(data.tasks);
    else addMessage(data.reply, "bot");
  } catch (e) {
    typing.remove();
    addMessage(`エラー: ${e.message}`, "bot");
  }
}

function setInputEnabled(on) {
  userInput().disabled = !on;
  sendBtn().disabled = !on;
  if (on) userInput().focus();
}

async function startTaskFlow() {
  flowData = {};
  setInputEnabled(false);
  if (MobileAPI.me && !MobileAPI.me.legacy) {
    currentState = STATE.TASK_COMPANY;
    try {
      const { companies } = await MobileAPI.companies();
      const btns = [{ label: "スキップ", value: "" }, ...companies.map((c) => ({ label: c.name, value: c.id }))];
      addBotMessageWithButtons("担当企業を選んでください（任意）", btns, (id) => {
        flowData.client_company_id = id || null;
        addMessage(id ? companies.find((c) => c.id === id)?.name || "選択" : "スキップ", "user");
        pickSeekerForTask();
      });
    } catch {
      currentState = STATE.TASK_NAME;
      setInputEnabled(true);
      addMessage("タスク内容を入力してください", "bot");
    }
  } else {
    currentState = STATE.TASK_NAME;
    setInputEnabled(true);
    addMessage("タスク内容を入力してください", "bot");
  }
}

async function pickSeekerForTask() {
  currentState = STATE.TASK_SEEKER;
  try {
    const { jobSeekers } = await MobileAPI.jobSeekers();
    const btns = [{ label: "スキップ", value: "" }, ...jobSeekers.map((j) => ({ label: j.name, value: j.id }))];
    addBotMessageWithButtons("担当転職者を選んでください（任意）", btns, (id) => {
      flowData.job_seeker_id = id || null;
      addMessage(id ? jobSeekers.find((j) => j.id === id)?.name || "選択" : "スキップ", "user");
      currentState = STATE.TASK_NAME;
      setInputEnabled(true);
      addMessage("タスク内容を入力してください", "bot");
    });
  } catch {
    currentState = STATE.TASK_NAME;
    setInputEnabled(true);
    addMessage("タスク内容を入力してください", "bot");
  }
}

async function finishTaskAdd() {
  currentState = STATE.IDLE;
  setInputEnabled(false);
  try {
    await MobileAPI.createTask({
      title: flowData.title,
      due_date: flowData.dueDate,
      priority: flowData.priority,
      client_company_id: flowData.client_company_id,
      job_seeker_id: flowData.job_seeker_id,
    });
    addMessage(`「${flowData.title}」を登録したよ✅`, "bot");
  } catch (e) {
    addMessage(`エラー: ${e.message}`, "bot");
  }
  setInputEnabled(true);
}

async function startCompleteFlow() {
  flowData = {};
  setInputEnabled(false);
  const typing = addTyping();
  let tasks = [];
  try { tasks = (await MobileAPI.tasks()).tasks || []; } catch (_) {}
  typing.remove();
  if (!tasks.length) { addMessage("未完了タスクはありません🎉", "bot"); setInputEnabled(true); return; }
  addBotMessageWithButtons("完了するタスクを選んでください", tasks.map((t) => ({ label: formatTaskLabel(t), value: t.id })), (id) => {
    flowData.completeTaskId = id;
    currentState = STATE.TASK_COMPLETE_RESULT;
    setInputEnabled(true);
    addMessage("結果・成果を入力（「なし」でスキップ）", "bot");
  });
}

async function startUpdatePriorityFlow() {
  flowData = {};
  const tasks = (await MobileAPI.tasks()).tasks || [];
  if (!tasks.length) { addMessage("未完了タスクはありません", "bot"); return; }
  addBotMessageWithButtons("優先度を変えるタスクを選んでください", tasks.map((t) => ({ label: formatTaskLabel(t), value: t.id })), (id) => {
    const task = tasks.find((t) => t.id === id);
    addBotMessageWithButtons("新しい優先度", [
      { label: "🔴 高", value: "高" }, { label: "🟡 中", value: "中" }, { label: "🟢 低", value: "低" },
    ], async (p) => {
      setInputEnabled(false);
      const typing = addTyping();
      try {
        await MobileAPI.updateTask({ id, priority: p });
        typing.remove();
        addMessage(`「${task.title}」の優先度を${p}に変更しました`, "bot");
      } catch (e) {
        typing.remove();
        addMessage(e.message, "bot");
      }
      setInputEnabled(true);
    });
  });
}

async function startUpdateDueFlow() {
  flowData = {};
  const tasks = (await MobileAPI.tasks()).tasks || [];
  if (!tasks.length) { addMessage("未完了タスクはありません", "bot"); return; }
  addBotMessageWithButtons("期日を変えるタスクを選んでください", tasks.map((t) => ({ label: formatTaskLabel(t), value: t.id })), (id) => {
    flowData.updateTaskId = id;
    flowData.updateTitle = tasks.find((t) => t.id === id)?.title || "";
    currentState = STATE.TASK_UPDATE_DUE_DATE;
    setInputEnabled(true);
    addMessage("新しい期日（例: 2026-06-10、「なし」で削除）", "bot");
  });
}

async function showTaskList() {
  addMessage("タスク一覧", "user");
  const typing = addTyping();
  try {
    const tasks = (await MobileAPI.tasks()).tasks || [];
    typing.remove();
    addTaskListMessage(tasks);
  } catch (e) {
    typing.remove();
    addMessage(e.message, "bot");
  }
}

function startInsightFlow() {
  flowData = {};
  currentState = STATE.INSIGHT_CONTENT;
  setInputEnabled(true);
  addMessage("気づきを入力してください📝", "bot");
}

async function handleUserInput(text) {
  if (!text) return;
  userInput().value = "";
  userInput().style.height = "auto";
  addMessage(text, "user");

  if (currentState === STATE.IDLE) {
    setInputEnabled(false);
    await callChat(text);
    setInputEnabled(true);
    return;
  }

  if (currentState === STATE.TASK_NAME) {
    flowData.title = text;
    currentState = STATE.TASK_DUE;
    addMessage("期限は？（例: 2026-06-10、「なし」で未設定）", "bot");
    return;
  }

  if (currentState === STATE.TASK_DUE) {
    flowData.dueDate = text === "なし" ? null : text;
    currentState = STATE.TASK_PRIORITY;
    setInputEnabled(false);
    addBotMessageWithButtons("優先度を選んでください", [
      { label: "🔴 高", value: "高" }, { label: "🟡 中", value: "中" }, { label: "🟢 低", value: "低" },
    ], async (p) => {
      flowData.priority = p;
      addMessage(p, "user");
      await finishTaskAdd();
    });
    return;
  }

  if (currentState === STATE.TASK_COMPLETE_RESULT) {
    currentState = STATE.IDLE;
    setInputEnabled(false);
    const typing = addTyping();
    try {
      const data = await MobileAPI.completeTask(flowData.completeTaskId, text === "なし" ? null : text);
      typing.remove();
      addMessage(`「${data.title}」を完了✅`, "bot");
    } catch (e) {
      typing.remove();
      addMessage(e.message, "bot");
    }
    setInputEnabled(true);
    return;
  }

  if (currentState === STATE.TASK_UPDATE_DUE_DATE) {
    currentState = STATE.IDLE;
    setInputEnabled(false);
    const typing = addTyping();
    const dueDate = text === "なし" ? null : text;
    try {
      await MobileAPI.updateTask({ id: flowData.updateTaskId, due_date: dueDate });
      typing.remove();
      addMessage(`「${flowData.updateTitle}」の期日を${text === "なし" ? "未設定" : text}に変更しました`, "bot");
    } catch (e) {
      typing.remove();
      addMessage(e.message, "bot");
    }
    setInputEnabled(true);
    return;
  }

  if (currentState === STATE.INSIGHT_CONTENT) {
    flowData.content = text;
    currentState = STATE.INSIGHT_CATEGORY;
    setInputEnabled(false);
    const typing = addTyping();
    let cats = ["仕事", "学び", "転職", "クライアント", "その他"];
    try {
      cats = (await MobileAPI.suggestCategories(text)).categories || cats;
    } catch (_) {}
    typing.remove();
    addBotMessageWithButtons("カテゴリ（複数可）", cats.map((c) => ({ label: c, value: c })), async (sel) => {
      const tags = Array.isArray(sel) ? sel.join(",") : sel;
      currentState = STATE.IDLE;
      await callChat(`気づき: ${flowData.content}${tags ? `、タグ:${tags}` : ""}`);
      setInputEnabled(true);
    }, true);
  }
}

/* 音声入力（MediaRecorder + transcribe API） */
let mediaRecorder, recordingStream, recordedChunks, isRecording, isTranscribing;

function resetMic() {
  isRecording = false;
  micBtn().classList.remove("recording");
}

micBtn().addEventListener("click", async () => {
  if (isTranscribing) return;
  if (isRecording) {
    mediaRecorder?.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage("この端末では音声入力が使えません", "bot");
    return;
  }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(recordingStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      recordingStream.getTracks().forEach((t) => t.stop());
      resetMic();
      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || "audio/webm" });
      if (!blob.size) return;
      isTranscribing = true;
      try {
        const text = await MobileAPI.transcribe(blob);
        if (text) { userInput().value = text; userInput().focus(); }
      } catch (e) { addMessage(e.message, "bot"); }
      isTranscribing = false;
    };
    mediaRecorder.start();
    isRecording = true;
    micBtn().classList.add("recording");
  } catch {
    addMessage("マイクの使用が許可されていません", "bot");
  }
});

sendBtn().addEventListener("click", () => handleUserInput(userInput().value.trim()));
userInput().addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleUserInput(userInput().value.trim());
  }
});
userInput().addEventListener("input", () => {
  userInput().style.height = "auto";
  userInput().style.height = Math.min(userInput().scrollHeight, 120) + "px";
});

document.getElementById("qa-task").onclick = startTaskFlow;
document.getElementById("qa-insight").onclick = startInsightFlow;
document.getElementById("qa-list").onclick = () => MobileNav.switch("tasks");
document.getElementById("qa-complete").onclick = startCompleteFlow;
document.getElementById("qa-update-priority").onclick = startUpdatePriorityFlow;
document.getElementById("qa-update-due").onclick = startUpdateDueFlow;

function updateHeaderOrg(org) {
  const el = document.getElementById("header-org-name");
  if (org?.name) { el.textContent = org.name; el.hidden = false; }
  else el.hidden = true;
}

async function loadHistory() {
  try {
    const data = await MobileAPI.messages();
    const msgs = Array.isArray(data) ? data : data.messages || [];
    if (!msgs.length) {
      addMessage("AgentDumpへようこそ！💬\nタスク・企業・転職者を管理できます", "bot");
      return;
    }
    let lastDate = "";
    msgs.forEach((m) => {
      const d = formatMsgDate(m.created_at);
      if (d !== lastDate) {
        const sep = document.createElement("div");
        sep.className = "history-separator";
        sep.textContent = d;
        chatBody().appendChild(sep);
        lastDate = d;
      }
      addMessage(m.content, m.role === "user" ? "user" : "bot", m.created_at);
    });
  } catch {
    addMessage("AgentDumpへようこそ！", "bot");
  }
}

async function bootstrap() {
  try {
    await MobileAPI.loadConfig();
    if (!MobileAPI.LIFF_ID) throw new Error("LIFF_ID が未設定です");
    await liff.init({ liffId: MobileAPI.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href.split("#")[0] });
      return;
    }

    MobileAPI.setLineToken(liff.getAccessToken());
    MobileAPI.restoreSession();

    const profile = await liff.getProfile();
    document.getElementById("header-user-name").textContent = profile.displayName;
    if (profile.pictureUrl) {
      const img = document.getElementById("header-user-icon");
      img.src = profile.pictureUrl;
      img.style.display = "block";
    }

    const invite = new URLSearchParams(location.search).get("invite");
    if (invite) {
      try {
        await MobileAPI.activateInvite(invite);
        history.replaceState(null, "", location.pathname);
        showToast("招待を受け付けました");
      } catch (e) {
        throw new Error(`招待の有効化に失敗しました: ${e.message}`);
      }
    }

    MobileAPI.me = await MobileAPI.authMe();
    if (MobileAPI.me.sessionToken) MobileAPI.setSessionToken(MobileAPI.me.sessionToken);
    if (!MobileAPI.me.legacy) {
      currentMember = MobileAPI.me.member;
      currentOrganization = MobileAPI.me.organization;
      updateHeaderOrg(MobileAPI.me.organization);
      if (typeof window.initOrgAdmin === "function") window.initOrgAdmin(MobileAPI.me);
    }

    document.getElementById("loading-overlay").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    MobileNav.init();
    await loadHistory();
  } catch (e) {
    document.getElementById("loading-overlay").innerHTML = `<p style="color:#fff;padding:1rem;text-align:center">${escapeHtml(e.message)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
