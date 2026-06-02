const { getSupabaseAdmin } = require("../supabase-admin");
const { requireLineMember } = require("../require-member");
const { fetchOrgUnits } = require("../org-tree");

function trimNames(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

function buildUnitsFromPayload(organizationId, body) {
  const depth = Number(body.depth);
  const rows = [];

  if (depth === 0) {
    return { depth: 0, rows: [] };
  }

  if (depth === 1) {
    const departments = trimNames(body.departments);
    if (departments.length === 0) throw new Error("部門名を1つ以上入力してください");
    departments.forEach((name) => {
      rows.push({
        organization_id: organizationId,
        parent_id: null,
        depth: 1,
        unit_type: "dept",
        name,
      });
    });
    return { depth, rows };
  }

  if (depth === 2) {
    const headquarters = body.headquarters;
    if (!Array.isArray(headquarters) || headquarters.length === 0) {
      throw new Error("本部を1つ以上入力してください");
    }
    headquarters.forEach((hq) => {
      const hqName = String(hq.name || "").trim();
      if (!hqName) throw new Error("本部名が空です");
      const hqKey = `hq_${rows.length}`;
      rows.push({
        organization_id: organizationId,
        parent_id: null,
        depth: 1,
        unit_type: "hq",
        name: hqName,
        _key: hqKey,
      });
      const depts = trimNames(hq.departments);
      if (depts.length === 0) throw new Error(`「${hqName}」に部門を1つ以上追加してください`);
      depts.forEach((dName) => {
        rows.push({
          organization_id: organizationId,
          parent_id: null,
          depth: 2,
          unit_type: "dept",
          name: dName,
          _parentKey: hqKey,
        });
      });
    });
    return { depth, rows };
  }

  if (depth === 3) {
    const headquarters = body.headquarters;
    if (!Array.isArray(headquarters) || headquarters.length === 0) {
      throw new Error("本部を1つ以上入力してください");
    }
    headquarters.forEach((hq) => {
      const hqName = String(hq.name || "").trim();
      if (!hqName) throw new Error("本部名が空です");
      const hqKey = `hq_${rows.length}`;
      rows.push({
        organization_id: organizationId,
        parent_id: null,
        depth: 1,
        unit_type: "hq",
        name: hqName,
        _key: hqKey,
      });
      const sections = hq.sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        throw new Error(`「${hqName}」に課・チームを1つ以上追加してください`);
      }
      sections.forEach((sec) => {
        const secName = String(sec.name || "").trim();
        if (!secName) throw new Error("課名が空です");
        const secKey = `sec_${rows.length}`;
        rows.push({
          organization_id: organizationId,
          parent_id: null,
          depth: 2,
          unit_type: "section",
          name: secName,
          _parentKey: hqKey,
          _key: secKey,
        });
        const depts = trimNames(sec.departments);
        if (depts.length === 0) throw new Error(`「${secName}」に部門を1つ以上追加してください`);
        depts.forEach((dName) => {
          rows.push({
            organization_id: organizationId,
            parent_id: null,
            depth: 3,
            unit_type: "dept",
            name: dName,
            _parentKey: secKey,
          });
        });
      });
    });
    return { depth, rows };
  }

  throw new Error("depth は 0, 1, 2, 3 のいずれかです");
}

async function persistUnitTree(supabase, organizationId, rows) {
  const idByKey = new Map();
  const cleanRows = [];

  for (const row of rows) {
    const parentKey = row._parentKey;
    const parentId = parentKey ? idByKey.get(parentKey) : null;
    const insertRow = {
      organization_id: organizationId,
      parent_id: parentId,
      depth: row.depth,
      unit_type: row.unit_type,
      name: row.name,
    };
    const { data, error } = await supabase
      .from("m_org_units")
      .insert(insertRow)
      .select("id")
      .single();
    if (error) throw error;
    if (row._key) idByKey.set(row._key, data.id);
    cleanRows.push({ ...insertRow, id: data.id });
  }
  return cleanRows;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人に所属していません" });
  }

  if (ctx.member.role !== "org_admin") {
    return res.status(403).json({ error: "代表管理者のみ組織設定できます" });
  }

  if (ctx.organization.status !== "pending_setup") {
    return res.status(409).json({ error: "組織設定は既に完了しています" });
  }

  const supabase = getSupabaseAdmin();
  const existing = await fetchOrgUnits(supabase, ctx.member.organization_id);
  if (existing.length > 0) {
    return res.status(409).json({ error: "組織ユニットは既に登録されています" });
  }

  const { agreed_terms } = req.body || {};
  if (!agreed_terms) {
    return res.status(400).json({
      error: "管理者は配下メンバーの気づきを閲覧できる旨の利用規約への同意が必要です",
    });
  }

  try {
    const { depth, rows } = buildUnitsFromPayload(ctx.member.organization_id, req.body);
    const units =
      rows.length > 0
        ? await persistUnitTree(supabase, ctx.member.organization_id, rows)
        : [];

    const { error: orgError } = await supabase
      .from("m_organizations")
      .update({
        org_structure_depth: depth,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.member.organization_id);

    if (orgError) throw orgError;

    await supabase.from("t_organization_agreements").insert({
      organization_id: ctx.member.organization_id,
      member_id: ctx.member.id,
    });

    return res.status(200).json({
      success: true,
      organization: {
        id: ctx.member.organization_id,
        status: "active",
        org_structure_depth: depth,
      },
      units,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
