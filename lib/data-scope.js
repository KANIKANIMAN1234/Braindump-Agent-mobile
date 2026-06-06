const { getAccessibleMemberIds } = require("./member-scope");

function isPersonalScope(ctx) {
  return !ctx.isAdmin || ctx.member.role === "member";
}

function applyOwnTasksScope(query, ctx) {
  const orgId = ctx.member.organization_id;
  const lineId = ctx.lineUserId;
  return query.or(
    `and(organization_id.eq.${orgId},line_user_id.eq.${lineId}),and(organization_id.is.null,line_user_id.eq.${lineId})`
  );
}

function applyTasksScope(query, ctx) {
  if (ctx.legacy) {
    return query.eq("line_user_id", ctx.lineUserId);
  }

  const orgId = ctx.member.organization_id;
  const lineId = ctx.lineUserId;
  const unitIds = ctx.accessibleUnitIds || [];
  const ownLegacy = `and(organization_id.is.null,line_user_id.eq.${lineId})`;

  if (ctx.member.role === "org_admin") {
    return query.eq("organization_id", orgId);
  }

  const ownInOrg = `and(organization_id.eq.${orgId},line_user_id.eq.${lineId})`;

  if (isPersonalScope(ctx) || unitIds.length === 0) {
    return query.or(`${ownInOrg},${ownLegacy}`);
  }

  const unitFilter = unitIds.join(",");
  return query.or(
    `${ownInOrg},${ownLegacy},and(organization_id.eq.${orgId},org_unit_id.in.(${unitFilter}))`
  );
}

function applyInsightsScope(query, ctx) {
  return applyTasksScope(query, ctx);
}

function applyMessagesScope(query, ctx) {
  return applyTasksScope(query, ctx);
}

function applyClientCompaniesScope(query, ctx) {
  if (ctx.legacy) {
    return query.eq("organization_id", "00000000-0000-0000-0000-000000000000");
  }
  const orgId = ctx.member?.organization_id || ctx.organization?.id;
  if (!orgId) {
    return query.eq("organization_id", "00000000-0000-0000-0000-000000000000");
  }
  return query.eq("organization_id", orgId);
}

function applyCompanyMemosScope(query, ctx) {
  return applyClientCompaniesScope(query, ctx);
}

async function applyJobSeekersScope(query, ctx, supabase) {
  if (ctx.legacy) {
    return query.eq("line_user_id", ctx.lineUserId);
  }

  const memberIds = await getAccessibleMemberIds(supabase, ctx);
  if (memberIds.length === 1) {
    return query.eq("member_id", memberIds[0]);
  }
  return query.in("member_id", memberIds);
}

function scopedRowData(ctx, base, opts = {}) {
  if (ctx.legacy) {
    return { ...base, line_user_id: ctx.lineUserId };
  }
  const row = {
    ...base,
    line_user_id: ctx.lineUserId,
    organization_id: ctx.member.organization_id,
    member_id: ctx.member.id,
  };
  if (opts.withOrgUnit) {
    row.org_unit_id = ctx.member.org_unit_id || null;
  }
  return row;
}

module.exports = {
  isPersonalScope,
  applyTasksScope,
  applyInsightsScope,
  applyMessagesScope,
  applyClientCompaniesScope,
  applyCompanyMemosScope,
  applyJobSeekersScope,
  scopedRowData,
  getAccessibleMemberIds,
};
