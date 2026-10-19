// SERVER-ONLY. Sending e-mail through Gmail as a company mailbox.
//
// An admin connects the mailbox once (plain OAuth 2.0, the same Google client the Drive connection uses);
// its refresh token is kept in email_connection (service role only). The scope is gmail.send: the site can
// send mail as that mailbox and nothing else - it cannot read anything in it. Every attempt is written to email_log.
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { DRIVE_ALLOWED_DOMAIN, driveConfig } from "@/lib/google-drive";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const MAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** Shown as the sender's name; the address is the connected mailbox. */
export const MAIL_FROM_NAME = "Warranty Desk - Jiad Motors";

export class MailError extends Error {}

export function buildMailAuthUrl(redirectUri, state) {
  const cfg = driveConfig();
  if (!cfg) throw new MailError("Google sign-in is not configured.");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `openid email ${MAIL_SCOPE}`, // openid + email only to learn which mailbox signed in
    access_type: "offline",
    prompt: "select_account consent", // the sender can be a different mailbox from the one signed in to the site
    hd: DRIVE_ALLOWED_DOMAIN,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body) {
  const cfg = driveConfig();
  if (!cfg) throw new MailError("Google sign-in is not configured.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new MailError(json.error_description ?? json.error ?? `Google rejected the request (${res.status}).`);
  return json;
}

/** Trades the sign-in code for the mailbox's address and a lasting refresh token. */
export async function exchangeMailCode(code, redirectUri) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  // The id_token came straight from Google's token endpoint over TLS, so its payload can be read without checking a signature.
  let email = "";
  try {
    const payload = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    if (payload.email_verified !== false) email = (payload.email ?? "").toLowerCase();
  } catch {
    // email stays empty and the caller reports it
  }
  return { refreshToken: t.refresh_token ?? null, email, canSend: (t.scope ?? "").split(" ").includes(MAIL_SCOPE) };
}

/** Which mailbox is connected (never the token), or null. */
export async function getMailStatus() {
  const { data } = await createAdminClient().from("email_connection").select("account_email, connected_at").eq("id", 1).maybeSingle();
  return data ? { accountEmail: data.account_email, connectedAt: data.connected_at } : null;
}

export async function saveMailConnection({ refreshToken, accountEmail, connectedBy }) {
  const { error } = await createAdminClient().from("email_connection").upsert({
    id: 1,
    refresh_token: refreshToken,
    account_email: accountEmail,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new MailError(`Could not save the connection: ${error.message}`);
  cached = null;
}

let cached = null;

async function accessToken() {
  const { data } = await createAdminClient().from("email_connection").select("refresh_token, account_email").eq("id", 1).maybeSingle();
  if (!data) throw new MailError("The e-mail sender is not connected yet.");
  if (cached && cached.expiresAt > Date.now() + 60_000) return { token: cached.token, from: data.account_email };
  try {
    const t = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
    cached = { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
    return { token: t.access_token, from: data.account_email };
  } catch (e) {
    cached = null;
    throw new MailError(
      e instanceof MailError && e.message === "invalid_grant"
        ? "The e-mail connection has expired - an admin needs to reconnect it in Settings."
        : "Could not reach Google - please try again."
    );
  }
}

// ---- building the message ---------------------------------------------------------------

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const oneLine = (s) => s.replace(/[\r\n]+/g, " ").trim();
/** RFC 2047 encoded-word so a subject (or a name) with any characters, Arabic and the em dash included, survives. */
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const wrap76 = (b64) => b64.replace(/(.{76})/g, "$1\r\n");
const htmlToText = (html) =>
  html
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function buildMime({ from, to, cc, subject, text, html, messageId }) {
  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${encodeWord(MAIL_FROM_NAME)} <${from}>`,
    to.length ? `To: ${to.join(", ")}` : null,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encodeWord(oneLine(subject))}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(Buffer.from(body, "utf8").toString("base64"))}\r\n`;
  return `${headers.join("\r\n")}\r\n\r\n${part("text/plain", text)}${html ? part("text/html", html) : ""}--${boundary}--`;
}

/** Sends one e-mail and logs the attempt. Never throws: the result says what happened. */
export async function sendMail({ kind, to = [], cc = [], subject, html, text, sentBy = null }) {
  const clean = (list) => [...new Set((list ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const toList = clean(to);
  // Someone already in To is not repeated in Cc.
  const ccList = clean(cc).filter((e) => !toList.includes(e));
  const recipients = [...toList, ...ccList];
  const log = (status, extra = {}) =>
    createAdminClient()
      .from("email_log")
      .insert({ kind, recipients, subject: oneLine(subject), status, error: extra.error ?? null, gmail_message_id: extra.id ?? null, sent_by: sentBy })
      .then(() => undefined, () => undefined);

  try {
    if (recipients.length === 0) throw new MailError("There is nobody to send this to.");
    const bad = recipients.find((e) => !EMAIL.test(e));
    if (bad) throw new MailError(`"${bad}" is not a valid e-mail address.`);

    const { token, from } = await accessToken();
    const messageId = `<${randomUUID()}@${from.split("@")[1]}>`;
    const raw = Buffer.from(buildMime({ from, to: toList.length ? toList : [from], cc: ccList, subject, text: text ?? htmlToText(html ?? ""), html, messageId })).toString("base64url");
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) throw new MailError(`Gmail refused the message (${res.status}): ${json.error?.message ?? "no details"}`);
    await log("sent", { id: json.id });
    return { ok: true, id: json.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : "The e-mail could not be sent.";
    console.error(`E-mail "${kind}" failed:`, error);
    await log("failed", { error });
    return { ok: false, error };
  }
}
