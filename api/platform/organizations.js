const { getSupabaseAdmin } = require("../../lib/supabase-admin");
const { verifyPlatformSecret, isPlatformDataAccessFull } = require("../../lib/platform-auth");
const { logPlatformAudit } = require("../../lib/audit");
const {
  generateInviteCode,
  getInviteExpiresAt,
  buildLiffInviteUrl,
} = require("../../lib/invites");

/**
 * GET  /api/platform/organizations — 法人一覧
 * POST /api/platform/organizations — 法人登録 + 代表管理者招待（任意）
 */
module.exports = async function handler(req, res) {
  const auth = verifyPlatformSecret(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id, name, postal_code, address, phone, org_structure_depth, status, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    await logPlatformAudit({
      actorType: "super_admin",
      action: "list_organizations",
      metadata: { count: data?.length ?? 0 },
    });

    return res.status(200).json({
      organizations: data || [],
      platformDataAccess: isPlatformDataAccessFull() ? "full" : "metadata_only",
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const { name, postal_code, address, phone, representative } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name（法人名）は必須です" });
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: name.trim(),
        postal_code: postal_code?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        status: "pending_setup",
      })
      .select()
      .single();

    if (orgError) return res.status(500).json({ error: orgError.message });

    await logPlatformAudit({
      actorType: "super_admin",
      action: "create_organization",
      organizationId: org.id,
      metadata: { name: org.name },
    });

    let inviteResult = null;

    if (representative && representative.display_name) {
      const repName = String(representative.display_name).trim();
      if (!repName) {
        return res.status(400).json({ error: "representative.display_name が空です" });
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({
          organization_id: org.id,
          role: "org_admin",
          display_name: repName,
          status: "invited",
        })
        .select()
        .single();

      if (memberError) return res.status(500).json({ error: memberError.message });

      const code = generateInviteCode();
      const { data: invite, error: inviteError } = await supabase
        .from("member_invites")
        .insert({
          member_id: member.id,
          code,
          expires_at: getInviteExpiresAt(),
          created_by_super_admin: true,
        })
        .select()
        .single();

      if (inviteError) return res.status(500).json({ error: inviteError.message });

      const inviteUrl = buildLiffInviteUrl(code);

      await logPlatformAudit({
        actorType: "super_admin",
        action: "invite_org_admin",
        organizationId: org.id,
        metadata: { member_id: member.id, display_name: repName },
      });

      inviteResult = {
        member,
        invite: { ...invite, invite_url: inviteUrl },
      };
    }

    return res.status(201).json({
      organization: org,
      representativeInvite: inviteResult,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
