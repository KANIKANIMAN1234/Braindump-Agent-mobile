const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyClientCompaniesScope, applyCompanyMemosScope } = require("../lib/data-scope");
const { handleOptions } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人メンバー登録後に利用できます" });
  }

  const supabase = getSupabaseAdmin();
  const companyId = req.query.companyId;
  const memoId = req.query.id;

  async function verifyCompanyAccess(cid) {
    let q = supabase.from("client_companies").select("id").eq("id", cid);
    q = applyClientCompaniesScope(q, ctx);
    const { data } = await q.maybeSingle();
    return !!data;
  }

  if (req.method === "GET" && companyId && !memoId) {
    if (!(await verifyCompanyAccess(companyId))) {
      return res.status(404).json({ error: "採用企業が見つかりません" });
    }
    let query = supabase
      .from("company_memos")
      .select("id, client_company_id, title, content, memo_type, created_at, updated_at, created_by_member_id")
      .eq("client_company_id", companyId)
      .order("created_at", { ascending: false });
    query = applyCompanyMemosScope(query, ctx);
    const { data: memos, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const memberIds = [...new Set((memos || []).map((m) => m.created_by_member_id).filter(Boolean))];
    let nameMap = {};
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from("members")
        .select("id, display_name")
        .in("id", memberIds);
      (members || []).forEach((m) => {
        nameMap[m.id] = m.display_name || "不明";
      });
    }

    const enriched = (memos || []).map((m) => ({
      ...m,
      created_by_name: nameMap[m.created_by_member_id] || "不明",
    }));
    return res.status(200).json({ memos: enriched });
  }

  if (req.method === "POST" && companyId) {
    if (!(await verifyCompanyAccess(companyId))) {
      return res.status(404).json({ error: "採用企業が見つかりません" });
    }
    const body = req.body || {};
    if (!body.content?.trim()) return res.status(400).json({ error: "内容は必須です" });
    const row = {
      organization_id: ctx.member.organization_id,
      client_company_id: companyId,
      title: body.title || null,
      content: body.content.trim(),
      memo_type: body.memo_type || "research",
      created_by_member_id: ctx.member.id,
      updated_by_member_id: ctx.member.id,
    };
    const { data, error } = await supabase.from("company_memos").insert(row).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({
      memo: {
        ...data,
        created_by_name: ctx.member.display_name || ctx.lineProfile?.displayName || "不明",
      },
    });
  }

  if (req.method === "PATCH" && memoId) {
    let findQ = supabase.from("company_memos").select("id").eq("id", memoId);
    findQ = applyCompanyMemosScope(findQ, ctx);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "メモが見つかりません" });

    const body = req.body || {};
    const update = {
      updated_by_member_id: ctx.member.id,
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) update.title = body.title || null;
    if (body.content !== undefined) {
      if (!body.content?.trim()) return res.status(400).json({ error: "内容は必須です" });
      update.content = body.content.trim();
    }
    if (body.memo_type !== undefined) update.memo_type = body.memo_type;

    const { data, error } = await supabase
      .from("company_memos")
      .update(update)
      .eq("id", memoId)
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ memo: data });
  }

  if (req.method === "DELETE" && memoId) {
    let findQ = supabase.from("company_memos").select("id").eq("id", memoId);
    findQ = applyCompanyMemosScope(findQ, ctx);
    const { data: found } = await findQ.maybeSingle();
    if (!found) return res.status(404).json({ error: "メモが見つかりません" });
    const { error } = await supabase.from("company_memos").delete().eq("id", memoId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
