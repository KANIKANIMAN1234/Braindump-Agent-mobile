const { GoogleAuth } = require("google-auth-library");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON が未設定です");
  }
  return new GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [DRIVE_SCOPE],
  });
}

async function getAccessToken() {
  const client = await getAuthClient().getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  if (!token) {
    throw new Error("Google Drive 認証トークンを取得できません");
  }
  return token;
}

async function driveJson(url, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Google Drive API error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function ensureSubfolder(parentId, name) {
  const safeName = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const list = await driveJson(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`
  );
  if (list.files?.length) return list.files[0].id;

  const created = await driveJson("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  return created.id;
}

async function ensurePath(rootId, pathStr) {
  const parts = String(pathStr || "").split("/").filter(Boolean);
  let current = rootId;
  for (const part of parts) {
    current = await ensureSubfolder(current, part);
  }
  return current;
}

async function uploadFile({ folderId, name, mimeType, buffer, subfolder }) {
  let parentId = folderId;
  if (subfolder) {
    parentId = await ensurePath(folderId, subfolder);
  }

  const metadata = JSON.stringify({ name, parents: [parentId] });
  const boundary = "agentdump_" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8"
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);

  const token = await getAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive upload failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function getOrganizationFolderId(supabase, organizationId) {
  const { data, error } = await supabase
    .from("m_organization_settings")
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
};
