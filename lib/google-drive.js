const { google } = require("googleapis");

function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON が未設定です");
  }
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

async function getDriveClient() {
  const auth = getAuthClient();
  return google.drive({ version: "v3", auth });
}

async function ensureSubfolder(drive, parentId, name) {
  const safeName = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const { data } = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (data.files && data.files.length > 0) return data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id;
}

async function ensurePath(drive, rootId, pathStr) {
  const parts = String(pathStr || "").split("/").filter(Boolean);
  let current = rootId;
  for (const part of parts) {
    current = await ensureSubfolder(drive, current, part);
  }
  return current;
}

async function uploadFile({ folderId, name, mimeType, buffer, subfolder }) {
  const drive = await getDriveClient();
  let parentId = folderId;
  if (subfolder) {
    parentId = await ensurePath(drive, folderId, subfolder);
  }

  const { data } = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: require("stream").Readable.from(buffer) },
    fields: "id, name, webViewLink",
  });
  return data;
}

async function getOrganizationFolderId(supabase, organizationId) {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("google_drive_folder_id, google_drive_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.google_drive_folder_id) {
    throw new Error("Google Drive フォルダ ID が未設定です（組織設定から登録してください）");
  }
  return data.google_drive_folder_id;
}

module.exports = {
  uploadFile,
  getOrganizationFolderId,
  ensureSubfolder,
  getDriveClient,
};
