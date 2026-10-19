// SERVER-ONLY (imported by route handlers). Google Drive over plain OAuth 2.0 + the Drive REST API.
//
// One company Google account is connected once by an admin; its refresh token is kept in
// google_drive_connection (service role only) and used to get short-lived access tokens.
// Scope is drive.file: the app only ever sees folders and files it created itself, so folder ids
// are kept in drive_folders instead of being looked up by name alone.
//
// Layout in the company Shared Drive:  Sub Dealer Claims / <sub-dealer branch> / <work order(s)>
import { createAdminClient } from "@/lib/supabase/admin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Only an account on this Google Workspace domain may be connected. */
export const DRIVE_ALLOWED_DOMAIN = "jiadmotors.com";
export const DRIVE_ROOT_FOLDER_NAME = "Sub Dealer Claims";
/** The company Shared Drive (same one the self-audit site uses). Not a secret - only an id; the env var overrides it. */
export const DRIVE_SHARED_DRIVE_ID = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || "0AMGzTNddVT5yUk9PVA";

export class DriveError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function driveConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function buildAuthUrl(redirectUri, state) {
  const cfg = driveConfig();
  if (!cfg) throw new DriveError("Google sign-in is not configured.");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline", // a refresh token, so the connection outlives one session
    prompt: "select_account consent", // always show the account chooser, and always issue a refresh token (even when reconnecting)
    hd: DRIVE_ALLOWED_DOMAIN,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body) {
  const cfg = driveConfig();
  if (!cfg) throw new DriveError("Google sign-in is not configured.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new DriveError(json.error_description ?? json.error ?? `Google rejected the request (${res.status}).`, res.status);
  }
  return json;
}

export function exchangeCode(code, redirectUri) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

// ---- stored connection ---------------------------------------------------------------

/** Who is connected, for the admin's status line. Never exposes the token. */
export async function getDriveStatus() {
  const { data } = await createAdminClient().from("google_drive_connection").select("account_email, root_folder_id, connected_at").eq("id", 1).maybeSingle();
  return data ? { accountEmail: data.account_email, rootFolderId: data.root_folder_id, connectedAt: data.connected_at } : null;
}

export async function saveDriveConnection({ refreshToken, accountEmail, rootFolderId, connectedBy }) {
  const admin = createAdminClient();
  const { data: previous } = await admin.from("google_drive_connection").select("root_folder_id").eq("id", 1).maybeSingle();
  const { error } = await admin.from("google_drive_connection").upsert({
    id: 1,
    refresh_token: refreshToken,
    account_email: accountEmail,
    root_folder_id: rootFolderId,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new DriveError(`Could not save the connection: ${error.message}`);
  // Reconnecting keeps every saved folder. Only if the root folder itself changed are the saved ids dropped
  // (they are found again by name under the new root).
  if (previous?.root_folder_id && previous.root_folder_id !== rootFolderId) {
    await admin.from("drive_folders").delete().neq("key", "");
  }
}

// ---- access token ----------------------------------------------------------------------

let cached = null;

async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { data } = await createAdminClient().from("google_drive_connection").select("refresh_token").eq("id", 1).maybeSingle();
  if (!data) throw new DriveError("Google Drive is not connected yet.");
  try {
    const t = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
    cached = { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
    return t.access_token;
  } catch (e) {
    cached = null;
    throw new DriveError(
      e instanceof DriveError && e.message === "invalid_grant"
        ? "The Google Drive connection has expired - an admin needs to reconnect it."
        : "Could not reach Google Drive - please try again.",
      e instanceof DriveError ? e.status : undefined
    );
  }
}

async function driveFetch(url, init = {}) {
  const token = await accessToken();
  return fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }, cache: "no-store" });
}

// ---- account, folders, files -----------------------------------------------------------

/** The e-mail of the account behind an access token (used once, at connect time). */
export async function accountEmailFor(accessTokenValue) {
  const res = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${accessTokenValue}` }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  const email = json.user?.emailAddress;
  if (!res.ok || !email) {
    throw new DriveError(`Could not read which Google account was connected (${res.status}): ${json.error?.message ?? "no details from Google"}`, res.status);
  }
  return email.toLowerCase();
}

export async function createFolderWithToken(accessTokenValue, name, parentId) {
  const res = await fetch(`${API}/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessTokenValue}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    throw new DriveError(`Could not create the "${name}" folder in Drive (${res.status}): ${json.error?.message ?? "no details from Google"}`, res.status);
  }
  return json.id;
}

/** An existing, not-trashed folder called `name` directly inside `parentId` (a Shared Drive's id works as a parent too), the oldest if several. */
export async function findFolderWithToken(accessTokenValue, name, parentId) {
  const q = `'${parentId}' in parents and name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({ q, fields: "files(id)", orderBy: "createdTime", pageSize: "1", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  if (parentId === DRIVE_SHARED_DRIVE_ID) {
    params.set("corpora", "drive");
    params.set("driveId", DRIVE_SHARED_DRIVE_ID);
  }
  const res = await fetch(`${API}/files?${params.toString()}`, { headers: { Authorization: `Bearer ${accessTokenValue}` }, cache: "no-store" });
  if (!res.ok) return null; // not found is fine - the caller then creates it
  const json = await res.json().catch(() => ({}));
  return json.files?.[0]?.id ?? null;
}

/** { name, trashed } of a folder, or null if it is gone / not reachable. */
async function folderInfo(id) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(id)}?fields=id,name,trashed&supportsAllDrives=true`);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json ? { name: json.name, trashed: json.trashed === true } : null;
}

/**
 * The Drive folder for `key` (e.g. "branch:<id>"): the saved one, else an existing folder of that
 * name under `parentId` (so folders are never doubled up, even after the saved ids were lost),
 * else a new one.
 */
export async function ensureFolder(key, name, parentId) {
  const admin = createAdminClient();
  const { data: known } = await admin.from("drive_folders").select("drive_id").eq("key", key).maybeSingle();
  if (known) {
    const info = await folderInfo(known.drive_id);
    if (info && !info.trashed) return known.drive_id;
  }
  const token = await accessToken();
  const id = (await findFolderWithToken(token, name, parentId)) ?? (await createFolderWithToken(token, name, parentId));
  await admin.from("drive_folders").upsert({ key, drive_id: id });
  return id;
}

/** Characters Drive/Windows dislike in names are replaced; names are kept short. */
export function safeDriveName(name) {
  const cleaned = String(name || "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return (cleaned || "file").slice(0, 200);
}

/** Folder name for a claim: "<sub-dealer WO>" until the dealer WO exists, then "<sub-dealer WO>-<dealer WO>". */
export function claimFolderLabel(claim) {
  const wo = (claim.work_order_number || claim.claim_number || "claim").trim();
  const dealer = (claim.dealer_work_order_number || "").trim();
  return safeDriveName(dealer ? `${wo}-${dealer}` : wo);
}

/** Renames a file or folder. False if it is gone. */
export async function renameFile(fileId, name) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new DriveError(`Could not rename the folder in Drive (${res.status}).`, res.status);
  return true;
}

/**
 * The Drive folder of one claim: Sub Dealer Claims / <branch> / <label>. If it already exists but its
 * name no longer matches the claim's work orders (the dealer work order was added or changed), it is
 * renamed. With create=false nothing is created (used when only a rename is wanted).
 */
export async function ensureClaimFolder({ claim, branchName, create = true }) {
  const drive = await getDriveStatus();
  if (!drive) throw new DriveError("Google Drive is not connected yet.");
  const label = claimFolderLabel(claim);
  const key = `claim:${claim.id}`;
  const admin = createAdminClient();

  const { data: known } = await admin.from("drive_folders").select("drive_id").eq("key", key).maybeSingle();
  if (known) {
    const info = await folderInfo(known.drive_id);
    if (info && !info.trashed) {
      if (info.name !== label) await renameFile(known.drive_id, label);
      return known.drive_id;
    }
  }
  if (!create) return null;
  const branchFolder = await ensureFolder(`branch:${claim.branch_id}`, safeDriveName(branchName || "Branch"), drive.rootFolderId);
  return ensureFolder(key, label, branchFolder);
}

/**
 * Opens a resumable upload session and returns its URL. The browser then PUTs the file straight to
 * Google (a serverless request body is capped far below a claim video's size). `origin` must be the
 * page's origin so Google answers the browser's cross-origin upload.
 */
export async function startResumableUpload({ parentId, name, mimeType, size, origin }) {
  const res = await driveFetch(`${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(size),
      Origin: origin,
    },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  const location = res.headers.get("Location");
  if (!res.ok || !location) throw new DriveError("Google Drive refused the upload - please try again.", res.status);
  return location;
}

export async function getFileMeta(fileId) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,parents,trashed,webViewLink&supportsAllDrives=true`);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j) return null;
  return { id: j.id, name: j.name, size: Number(j.size ?? 0), mimeType: j.mimeType, parents: j.parents ?? [], trashed: j.trashed === true, webViewLink: j.webViewLink ?? null };
}

/** Moves a file to the Drive trash (recoverable for 30 days from there). False if it is already gone. */
export async function trashFile(fileId) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new DriveError(`Could not remove the file from Drive (${res.status}).`, res.status);
  return true;
}

/** Uploads bytes the server already has (used by the one-off migration of older files). Returns the file id. */
export async function createFileWithBytes({ parentId, name, mimeType, bytes }) {
  const boundary = `evidence${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) throw new DriveError(`Could not save "${name}" to Drive (${res.status}): ${json.error?.message ?? "no details"}`, res.status);
  return json.id;
}

/** The file's bytes (honouring a Range header so videos can seek). */
export async function downloadFile(fileId, range) {
  return driveFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: range ? { Range: range } : undefined,
  });
}
