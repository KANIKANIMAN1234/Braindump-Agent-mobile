const { getSupabaseAdmin } = require("./supabase-admin");

async function logPlatformAudit({ actorType, actorId, action, organizationId, metadata }) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("t_platform_audit_logs").insert({
      actor_type: actorType,
      actor_id: actorId || null,
      action,
      organization_id: organizationId || null,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error("audit log error:", err);
  }
}

module.exports = { logPlatformAudit };
