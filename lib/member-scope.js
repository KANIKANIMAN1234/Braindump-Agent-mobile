/**
 * マネージャーが閲覧可能な member_id 一覧
 */
async function getAccessibleMemberIds(supabase, ctx) {
  if (ctx.legacy) return [];

  const orgId = ctx.member.organization_id;
  const selfId = ctx.member.id;

  if (ctx.member.role === "org_admin") {
    const { data, error } = await supabase
      .from("m_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (error) throw error;
    return (data || []).map((m) => m.id);
  }

  const unitIds = ctx.accessibleUnitIds || [];
  if (ctx.member.role === "member" || unitIds.length === 0) {
    return [selfId];
  }

  const { data, error } = await supabase
    .from("m_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("org_unit_id", unitIds);

  if (error) throw error;
  const ids = new Set((data || []).map((m) => m.id));
  ids.add(selfId);
  return [...ids];
}

module.exports = { getAccessibleMemberIds };
