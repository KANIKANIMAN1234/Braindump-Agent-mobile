const { handleOptions } = require("../../lib/cors");
const { runLineTaskReminders } = require("../../lib/task-reminders");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "CRON_SECRET が未設定です" });
  }

  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await runLineTaskReminders();
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error("cron task-reminders error:", e);
    return res.status(500).json({ error: e.message });
  }
};
