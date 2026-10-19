import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  DRIVE_ALLOWED_DOMAIN,
  DRIVE_ROOT_FOLDER_NAME,
  accountEmailFor,
  createFolderWithToken,
  exchangeCode,
  findRootFolder,
  saveDriveConnection,
} from "@/lib/google-drive";

export const dynamic = "force-dynamic";

function sameState(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Where Google sends the admin back after they press Allow. Checks the state, trades the code for a
 * refresh token, makes sure the account is a company one, finds the shared "Sub Dealer Claims" folder
 * (or creates it if none exists) and saves the connection.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const done = (flag, detail) => {
    // detail is Google's own error text (never a secret); only admins see this page.
    const extra = detail ? `&detail=${encodeURIComponent(detail.slice(0, 700))}` : "";
    const res = NextResponse.redirect(`${origin}/dashboard/settings?drive=${flag}${extra}`);
    res.cookies.delete({ name: "gd_state", path: "/api/google-drive" });
    return res;
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.redirect(`${origin}/login`);

  if (url.searchParams.get("error")) return done("cancelled");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers.get("cookie")?.match(/(?:^|;\s*)gd_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || !sameState(state, cookieState)) return done("bad-state");

  // Each step is named, so a failure says exactly where it stopped.
  let step = "exchanging the sign-in code with Google";
  let who = "";
  try {
    const tokens = await exchangeCode(code, `${origin}/api/google-drive/callback`);
    if (!tokens.refresh_token) return done("no-refresh-token");

    step = "reading which Google account connected";
    const email = await accountEmailFor(tokens.access_token);
    who = ` (signed in as ${email}; permissions granted: ${tokens.scope || "unknown"})`;
    if (!email.endsWith(`@${DRIVE_ALLOWED_DOMAIN}`)) return done("wrong-account");

    step = `looking for the shared "${DRIVE_ROOT_FOLDER_NAME}" folder`;
    // Use the existing shared folder (a reconnect must never start a second one).
    const found = await findRootFolder(tokens.access_token);
    if (found && !found.writable) {
      return done("failed", `The "${DRIVE_ROOT_FOLDER_NAME}" folder is shared with ${email} as view-only. Give this account Editor (or Content manager) access to it in Google Drive, then connect again.`);
    }
    let rootFolderId, note;
    if (found) {
      rootFolderId = found.id;
      note = found.count > 1 ? `Found ${found.count} folders named "${DRIVE_ROOT_FOLDER_NAME}" - using the oldest one this account can edit.` : `Using the existing "${DRIVE_ROOT_FOLDER_NAME}" folder.`;
    } else {
      step = `creating the "${DRIVE_ROOT_FOLDER_NAME}" folder`;
      rootFolderId = await createFolderWithToken(tokens.access_token, DRIVE_ROOT_FOLDER_NAME);
      note = `No folder named "${DRIVE_ROOT_FOLDER_NAME}" was visible to ${email}, so a new one was created in that account's My Drive. Share it with the team in Google Drive.`;
    }

    step = "saving the connection";
    await saveDriveConnection({ refreshToken: tokens.refresh_token, accountEmail: email, rootFolderId, connectedBy: user.id });
    return done("connected", note);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Google Drive connect failed while ${step}:`, message);
    return done("failed", `While ${step}: ${message}${who}`);
  }
}
