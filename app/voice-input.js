/** フォーム音声入力（MediaRecorder + /api/transcribe） */
const VoiceInput = (function () {
  let mediaRecorder = null;
  let recordingStream = null;
  let recordedChunks = [];
  let isRecording = false;
  let activeBtn = null;
  let transcribeFn = null;

  function notify(msg) {
    if (typeof showToast === "function") showToast(msg);
    else alert(msg);
  }

  function setFieldValue(el, text) {
    const t = String(text || "").trim();
    if (!t) return;
    if (el.tagName === "TEXTAREA") {
      el.value = el.value ? `${el.value}\n${t}` : t;
    } else {
      el.value = el.value ? `${el.value} ${t}` : t;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function toggleRecord(btn, targetEl) {
    if (!transcribeFn) return;
    if (isRecording && activeBtn === btn) {
      mediaRecorder?.stop();
      return;
    }
    if (isRecording) {
      notify("他の項目で録音中です");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      notify("この端末では音声入力が使えません");
      return;
    }

    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(recordingStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        recordingStream.getTracks().forEach((t) => t.stop());
        isRecording = false;
        btn.classList.remove("recording");
        btn.disabled = false;
        btn.setAttribute("aria-label", "音声入力");
        activeBtn = null;
        const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || "audio/webm" });
        if (!blob.size) return;
        btn.disabled = true;
        try {
          const text = await transcribeFn(blob);
          if (text) setFieldValue(targetEl, text);
          else notify("音声を認識できませんでした");
        } catch (e) {
          notify(e.message);
        } finally {
          btn.disabled = false;
        }
      };
      mediaRecorder.start();
      isRecording = true;
      activeBtn = btn;
      btn.classList.add("recording");
      btn.setAttribute("aria-label", "録音停止（タップ）");
    } catch {
      notify("マイクの使用が許可されていません");
    }
  }

  function createMicBtn() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "field-mic-btn";
    btn.setAttribute("aria-label", "音声入力");
    btn.title = "音声入力（タップで開始/停止）";
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93H2c0 4.97 3.59 9.1 8.35 9.84V21h3v-2.23C18.41 18.1 22 13.97 22 9h-2c0 4.08-3.06 7.44-7 7.93V15.93z"/></svg>';
    return btn;
  }

  function attachToField(fieldEl) {
    if (!fieldEl || fieldEl.dataset.voiceWired) return;
    fieldEl.dataset.voiceWired = "1";
    const wrap = document.createElement("div");
    wrap.className = "field-with-mic";
    fieldEl.parentNode.insertBefore(wrap, fieldEl);
    wrap.appendChild(fieldEl);
    const btn = createMicBtn();
    wrap.appendChild(btn);
    btn.onclick = () => toggleRecord(btn, fieldEl);
  }

  const SEEKER_FIELD_SELECTORS = [
    "#seeker-import-text",
    '[name="name"]',
    '[name="age"]',
    '[name="current_salary_man"]',
    '[name="desired_salary_man"]',
    '[name="current_company"]',
    '[name="desired_timing"]',
    '[name="desired_job_type"]',
    '[name="notes"]',
  ];

  function wireSeekerForm(formRoot, transcribe) {
    if (!formRoot) return;
    transcribeFn = transcribe;
    SEEKER_FIELD_SELECTORS.forEach((sel) => {
      const el = formRoot.querySelector(sel);
      if (el) attachToField(el);
    });
  }

  return { wireSeekerForm, attachToField };
})();
