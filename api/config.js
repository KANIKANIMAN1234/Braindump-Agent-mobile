const { handleOptions } = require("../lib/cors");

module.exports = function handler(req, res) {
  if (handleOptions(req, res)) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const liffId = process.env.LIFF_ID || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: "SUPABASE_URL または SUPABASE_ANON_KEY が設定されていません",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ supabaseUrl, supabaseAnonKey, liffId, appName: "AgentDump" });
};
