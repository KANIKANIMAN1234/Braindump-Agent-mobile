/**
 * 組織ツリー操作
 */

async function fetchOrgUnits(supabase, organizationId) {
  const { data, error } = await supabase
    .from("org_units")
    .select("id, parent_id, depth, unit_type, name")
    .eq("organization_id", organizationId)
    .order("depth", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

function buildChildrenMap(units) {
  const byParent = new Map();
  units.forEach((u) => {
    const key = u.parent_id || "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(u);
  });
  return byParent;
}

function collectDescendantIds(unitId, byParent) {
  const result = [unitId];
  const children = byParent.get(unitId) || [];
  children.forEach((child) => {
    result.push(...collectDescendantIds(child.id, byParent));
  });
  return result;
}

/** 指定 unit とその子孫すべての ID */
async function getDescendantUnitIds(supabase, organizationId, rootUnitId) {
  const units = await fetchOrgUnits(supabase, organizationId);
  const byParent = buildChildrenMap(units);
  if (!rootUnitId) {
    return units.map((u) => u.id);
  }
  return collectDescendantIds(rootUnitId, byParent);
}

/** ロールに応じた閲覧可能 org_unit_id 一覧 */
async function getAccessibleUnitIds(supabase, member, organizationId) {
  const units = await fetchOrgUnits(supabase, organizationId);

  if (member.role === "org_admin") {
    return units.map((u) => u.id);
  }

  if (!member.org_unit_id) {
    return member.role === "member" ? [] : units.map((u) => u.id);
  }

  const byParent = buildChildrenMap(units);
  return collectDescendantIds(member.org_unit_id, byParent);
}

function buildTree(units) {
  const byParent = buildChildrenMap(units);
  function buildNode(parentKey) {
    return (byParent.get(parentKey) || []).map((u) => ({
      ...u,
      children: buildNode(u.id),
    }));
  }
  return buildNode("root");
}

/** 招待先として妥当か（inviter の配下か） */
function isUnitInSubtree(unitId, rootUnitId, units) {
  if (!rootUnitId) return true;
  const byParent = buildChildrenMap(units);
  const allowed = collectDescendantIds(rootUnitId, byParent);
  return allowed.includes(unitId);
}

const INVITE_PERMISSIONS = {
  org_admin: ["unit_admin", "dept_admin", "member"],
  unit_admin: ["dept_admin", "member"],
  dept_admin: ["member"],
};

function canInviteRole(inviterRole, targetRole) {
  return (INVITE_PERMISSIONS[inviterRole] || []).includes(targetRole);
}

/** ロールに応じた招待可能な org_unit */
function getInvitableUnits(units, inviter) {
  if (inviter.role === "org_admin") {
    return units;
  }
  if (!inviter.org_unit_id) return [];
  const byParent = buildChildrenMap(units);
  const allowedIds = new Set(collectDescendantIds(inviter.org_unit_id, byParent));
  return units.filter((u) => allowedIds.has(u.id));
}

module.exports = {
  fetchOrgUnits,
  getDescendantUnitIds,
  getAccessibleUnitIds,
  buildTree,
  isUnitInSubtree,
  canInviteRole,
  getInvitableUnits,
  INVITE_PERMISSIONS,
};
