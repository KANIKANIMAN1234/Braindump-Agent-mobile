const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const { handleOptions } = require("../cors");
const { normalizePrefs, DEFAULT_PREFS, sendTestLineNotification } = require("../task-reminders");

async function getOrCreatePrefs(supabase, memberId) {
  const { data } = await supabase
    .from("m_member_preferences")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (data) return normalizePrefs(data);

  const { data: created, error } = await supabase
    .from("m_member_preferences")
    .insert({ member_id: memberId })
    .select("*")
    .single();

  if (error) throw error;
  return normalizePrefs(created);
}

function prefsToResponse(row) {
  const p = normalizePrefs(row);
  return {
    lineEnabled: p.line_notify_enabled,
    dueTomorrow: p.line_notify_due_tomorrow,
    dueTodayHigh: p.line_notify_due_today_high,
    browserEnabled: p.browser_notify_enabled,
    browserDueTomorrow: p.browser_notify_due_tomorrow,
    browserDueTodayHigh: p.browser_notify_due_today_high,
    updatedAt: row?.updated_at || null,
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人メンバー登録後に利用できます" });
  }

  const supabase = getSupabaseAdmin();
  const memberId = ctx.member.id;

  if (req.method === "GET") {
    try {
      const prefs = await getOrCreatePrefs(supabase, memberId);
      return res.status(200).json({ preferences: prefsToResponse(prefs) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "PATCH") {
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };

    if (body.lineEnabled !== undefined) update.line_notify_enabled = !!body.lineEnabled;
    if (body.dueTomorrow !== undefined) update.line_notify_due_tomorrow = !!body.dueTomorrow;
    if (body.dueTodayHigh !== undefined) update.line_notify_due_today_high = !!body.dueTodayHigh;
    if (body.browserEnabled !== undefined) update.browser_notify_enabled = !!body.browserEnabled;
    if (body.browserDueTomorrow !== undefined) update.browser_notify_due_tomorrow = !!body.browserDueTomorrow;
    if (body.browserDueTodayHigh !== undefined) update.browser_notify_due_today_high = !!body.browserDueTodayHigh;

    try {
      await getOrCreatePrefs(supabase, memberId);
      const { data, error } = await supabase
        .from("m_member_preferences")
        .update(update)
        .eq("member_id", memberId)
        .select("*")
        .single();
      if (error) throw error;
      return res.status(200).json({ preferences: prefsToResponse(data) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      const lineUserId = String(ctx.member.line_user_id || ctx.lineUserId || "").trim();
      await sendTestLineNotification(memberId, lineUserId);
      return res.status(200).json({ success: true, message: "テスト通知を送信しました" });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};

module.exports.DEFAULT_PREFS = DEFAULT_PREFS;
