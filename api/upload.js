const { getSupabaseAdmin } = require("../lib/supabase-admin");
const { requireLineMember } = require("../lib/require-member");
const { applyJobSeekersScope } = require("../lib/data-scope");
const { uploadFile, getOrganizationFolderId } = require("../lib/google-drive");
const { handleOptions } = require("../lib/cors");

const MAX_BYTES = 10 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ctx = await requireLineMember(req, res);
  if (!ctx) return;

  if (ctx.legacy) {
    return res.status(403).json({ error: "法人メンバー登録後に利用できます" });
  }

  const { jobSeekerId, type, fileName, contentBase64 } = req.body || {};
  if (!jobSeekerId || !type || !contentBase64) {
    return res.status(400).json({ error: "jobSeekerId, type, contentBase64 は必須です" });
  }
  if (!["resume", "cv"].includes(type)) {
    return res.status(400).json({ error: "type は resume または cv" });
  }

  const buffer = Buffer.from(contentBase64, "base64");
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: "ファイルサイズは10MB以下にしてください" });
  }

  const supabase = getSupabaseAdmin();

  let findQ = supabase.from("m_job_seekers").select("id, name").eq("id", jobSeekerId);
  findQ = await applyJobSeekersScope(findQ, ctx, supabase);
  const { data: seeker } = await findQ.maybeSingle();
  if (!seeker) return res.status(404).json({ error: "転職者が見つかりません" });

  try {
    const folderId = await getOrganizationFolderId(supabase, ctx.member.organization_id);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const safeName = (fileName || `${type}.pdf`).replace(/[^\w.\-]/g, "_");
    const driveName = `${type}_${seeker.id.slice(0, 8)}_${date}_${safeName}`;

    const uploaded = await uploadFile({
      folderId,
      name: driveName,
      mimeType: "application/pdf",
      buffer,
      subfolder: `job_seekers/${seeker.id}`,
    });

    const update =
      type === "resume"
        ? { resume_drive_file_id: uploaded.id, resume_file_name: uploaded.name }
        : { cv_drive_file_id: uploaded.id, cv_file_name: uploaded.name };

    const { data, error } = await supabase
      .from("m_job_seekers")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", jobSeekerId)
      .select("id, resume_drive_file_id, resume_file_name, cv_drive_file_id, cv_file_name")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      success: true,
      fileId: uploaded.id,
      fileName: uploaded.name,
      webViewLink: uploaded.webViewLink,
      jobSeeker: data,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
