const { getSupabaseAdmin } = require("./supabase-admin");
const { pushLineMessage } = require("./line-push");

const DEFAULT_PREFS = {
  line_notify_enabled: false,
  line_notify_due_tomorrow: true,
  line_notify_due_today_high: true,
  browser_notify_enabled: false,
  browser_notify_due_tomorrow: true,
  browser_notify_due_today_high: true,
};

function dateInTokyo(addDays = 0) {
  const base = new Date(Date.now() + addDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(base);
}

function normalizePrefs(row) {
  return { ...DEFAULT_PREFS, ...(row || {}) };
}

async function wasAlreadySent(supabase, memberId, taskId, notifyType, notifyDate, channel) {
  const { data } = await supabase
    .from("t_notification_log")
    .select("id")
    .eq("member_id", memberId)
    .eq("task_id", taskId)
    .eq("notify_type", notifyType)
    .eq("notify_date", notifyDate)
    .eq("channel", channel)
    .maybeSingle();
  return !!data;
}

async function logSent(supabase, memberId, taskId, notifyType, notifyDate, channel) {
  const { error } = await supabase.from("t_notification_log").insert({
    member_id: memberId,
    task_id: taskId,
    notify_type: notifyType,
    notify_date: notifyDate,
    channel,
  });
  if (error && !String(error.message).includes("duplicate")) {
    throw error;
  }
}

async function getOpenTasksForMember(supabase, memberId, lineUserId) {
  let query = supabase
    .from("t_tasks")
    .select("id, title, due_date, priority, completed, member_id, line_user_id")
    .or("completed.eq.false,completed.is.null");

  if (memberId) {
    query = query.eq("member_id", memberId);
  } else if (lineUserId) {
    query = query.eq("line_user_id", lineUserId);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function collectReminderTasks(tasks, prefs, today, tomorrow) {
  const tomorrowTasks = [];
  const todayHighTasks = [];

  (tasks || []).forEach((t) => {
    if (!t.due_date) return;
    if (prefs.line_notify_due_tomorrow && t.due_date === tomorrow) {
      tomorrowTasks.push(t);
    }
    if (prefs.line_notify_due_today_high && t.due_date === today && t.priority === "高") {
      todayHighTasks.push(t);
    }
  });

  return { tomorrowTasks, todayHighTasks };
}

function buildLineMessage(tomorrowTasks, todayHighTasks) {
  const lines = ["【AgentDump】タスクリマインド"];
  if (tomorrowTasks.length) {
    lines.push("");
    lines.push("■ 明日が期限");
    tomorrowTasks.forEach((t) => lines.push(`・${t.title}`));
  }
  if (todayHighTasks.length) {
    lines.push("");
    lines.push("■ 本日期限（高優先度）");
    todayHighTasks.forEach((t) => lines.push(`・${t.title}`));
  }
  return lines.join("\n");
}

async function sendLineRemindersForMember(supabase, member, prefs, today, tomorrow) {
  const lineUserId = String(member.line_user_id || "").trim();
  if (!lineUserId || member.status !== "active") {
    return { skipped: true, reason: "line_user_unavailable" };
  }

  const tasks = await getOpenTasksForMember(supabase, member.id, lineUserId);
  const { tomorrowTasks, todayHighTasks } = collectReminderTasks(tasks, prefs, today, tomorrow);

  const toNotifyTomorrow = [];
  for (const t of tomorrowTasks) {
    const sent = await wasAlreadySent(supabase, member.id, t.id, "due_tomorrow", today, "line");
    if (!sent) toNotifyTomorrow.push(t);
  }

  const toNotifyToday = [];
  for (const t of todayHighTasks) {
    const sent = await wasAlreadySent(supabase, member.id, t.id, "due_today_high", today, "line");
    if (!sent) toNotifyToday.push(t);
  }

  if (!toNotifyTomorrow.length && !toNotifyToday.length) {
    return { skipped: true, reason: "nothing_to_send" };
  }

  const text = buildLineMessage(toNotifyTomorrow, toNotifyToday);
  await pushLineMessage(lineUserId, text);

  for (const t of toNotifyTomorrow) {
    await logSent(supabase, member.id, t.id, "due_tomorrow", today, "line");
  }
  for (const t of toNotifyToday) {
    await logSent(supabase, member.id, t.id, "due_today_high", today, "line");
  }

  return {
    sent: true,
    tomorrowCount: toNotifyTomorrow.length,
    todayHighCount: toNotifyToday.length,
  };
}

async function runLineTaskReminders() {
  const supabase = getSupabaseAdmin();
  const today = dateInTokyo(0);
  const tomorrow = dateInTokyo(1);

  const { data: prefRows, error: prefErr } = await supabase
    .from("m_member_preferences")
    .select("*")
    .eq("line_notify_enabled", true);

  if (prefErr) throw prefErr;

  const results = { sent: 0, skipped: 0, errors: [] };

  for (const row of prefRows || []) {
    const { data: member, error: memErr } = await supabase
      .from("m_members")
      .select("id, line_user_id, status, display_name")
      .eq("id", row.member_id)
      .maybeSingle();
    if (memErr || !member?.id) {
      results.skipped++;
      continue;
    }
    const prefs = normalizePrefs(row);
    try {
      const r = await sendLineRemindersForMember(supabase, member, prefs, today, tomorrow);
      if (r.sent) results.sent++;
      else results.skipped++;
    } catch (e) {
      results.errors.push({ memberId: member.id, error: e.message });
    }
  }

  return { today, tomorrow, ...results };
}

async function sendTestLineNotification(memberId, lineUserId) {
  if (!lineUserId) throw new Error("LINE アカウントが紐づいていません");
  await pushLineMessage(
    lineUserId,
    "【AgentDump】LINE 通知のテストです。\nタスク期限リマインドがこの LINE に届きます。"
  );
  return { success: true, memberId };
}

module.exports = {
  dateInTokyo,
  normalizePrefs,
  DEFAULT_PREFS,
  runLineTaskReminders,
  sendTestLineNotification,
  getOpenTasksForMember,
  collectReminderTasks,
};
