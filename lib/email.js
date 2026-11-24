import { getMailStatus, sendMail } from "@/lib/gmail";

/**
 * Sends one e-mail. Uses the company Gmail mailbox when an admin has connected it (Settings in the menu),
 * otherwise falls back to Resend if RESEND_API_KEY is set. Throws with a readable message when neither works.
 */
export async function sendEmail({ to, cc, subject, html, kind = "notice", sentBy = null, fromName = null, replyTo = null, attachments = [] }) {
  if (await getMailStatus()) {
    const result = await sendMail({ kind, to, cc, subject, html, sentBy, fromName, replyTo, attachments });
    if (!result.ok) throw new Error(result.error);
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email is not set up yet - an admin needs to connect the e-mail sender in Settings (menu).");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: (() => {
        const base = process.env.RESEND_FROM_EMAIL || "WarrantyDesk <onboarding@resend.dev>";
        const address = /<([^>]+)>/.exec(base)?.[1] || base;
        return fromName ? `${String(fromName).replace(/["<>]/g, "")} <${address}>` : base;
      })(),
      ...(replyTo ? { reply_to: replyTo } : {}),
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
      subject,
      html,
      ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content, "utf8")).toString("base64") })) } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email provider rejected the send: ${errText}`);
  }
}

export function claimInfoTable(claim, extraRows = []) {
  const free = claim.kind === "free_service";
  const money = claim.approved_amount != null ? `SAR ${Number(claim.approved_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  const rows = [
    [free ? "Free Service" : "Claim", `<b>${claim.claim_number}</b>`],
    ["Branch", claim.branches?.name || "—"],
    ["VIN", claim.vin],
    ...(free && claim.service_requested ? [["Service", claim.service_requested]] : []),
    ...(free && claim.mileage != null ? [["Mileage", `${Number(claim.mileage).toLocaleString("en-US")} km`]] : []),
    ["Work Order (Sub-Dealer)", claim.work_order_number],
    ...(claim.dealer_work_order_number ? [["Work Order (Dealer)", claim.dealer_work_order_number]] : []),
    ...(free && money ? [["Approved amount", `<b>${money}</b>`]] : []),
    ...extraRows,
  ];
  return `<table style="border-collapse: collapse; margin: 12px 0;">${rows
    .map(([label, value]) => `<tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">${label}</td><td>${value}</td></tr>`)
    .join("")}</table>`;
}

/** A two-column details table from [label, html] rows. */
export function rowsTable(rows) {
  return `<table style="border-collapse: collapse; margin: 12px 0;">${rows
    .map(([label, value]) => `<tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E; vertical-align: top;">${label}</td><td>${value}</td></tr>`)
    .join("")}</table>`;
}

/** The red "open it" button. */
export function linkButton(url, label) {
  return `<p><a href="${url}" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">${label}</a></p>`;
}

/** The web address of a page in the portal. */
export function siteUrl(path) {
  return `${(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "")}${path}`;
}

const DEFAULT_SITE_URL = "https://sub-dealer-warranty-desk.vercel.app";

/** The full web address of a claim in the portal. */
export function claimUrl(claimId, kind) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return `${siteUrl.replace(/\/$/, "")}/${kind === "free_service" ? "free-service" : "claims"}/${claimId}`;
}

export function claimLinkButton(claimId, kind) {
  const link = claimUrl(claimId, kind);
  return `<p><a href="${link}" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open the claim</a></p>`;
}

const mailEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The weekly dashboard e-mail's layout: a header, the intro text, the main numbers as tiles, and the two ways to explore it
 * (the attached interactive file, or the live portal). `tiles` = [{ label, value, note, bg, fg }]. Table-based with inline
 * styles, so it holds up in Gmail and Outlook.
 */
export function weeklyDashboardMail({ introHtml, tiles = [], showTiles = true, showPortal = true, portalUrl, fileName, period, exported }) {
  const font = "font-family: Arial, Helvetica, sans-serif;";
  const tile = (t) => `
    <td width="50%" valign="top" style="padding: 5px;">
      <div style="background: ${t.bg}; border-radius: 14px; padding: 14px 16px;">
        <div style="${font} font-size: 12px; font-weight: bold; color: #4D4D4D;">${mailEsc(t.label)}</div>
        <div style="${font} font-size: 24px; font-weight: bold; color: #111111; margin-top: 6px; line-height: 1.1;">${mailEsc(t.value)}</div>
        <div style="${font} font-size: 11px; color: #6E6E6E; margin-top: 6px;">${mailEsc(t.note)}</div>
      </div>
    </td>`;
  const rows = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(`<tr>${tile(tiles[i])}${tiles[i + 1] ? tile(tiles[i + 1]) : '<td width="50%"></td>'}</tr>`);
  const step = (n, title, body) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 10px;"><tr>
      <td width="40" valign="top" style="padding: 14px 0 0 14px;"><div style="${font} width: 28px; height: 28px; line-height: 28px; border-radius: 14px; background: #E4002B; color: #ffffff; font-weight: bold; font-size: 14px; text-align: center;">${n}</div></td>
      <td valign="top" style="padding: 14px 16px 14px 10px;">${title ? `<div style="${font} font-size: 15px; font-weight: bold; color: #111111;">${title}</div>` : ""}${body}</td>
    </tr></table>`;
  const attachment = step(
    1,
    "Open the attached file",
    `<div style="${font} font-size: 13px; line-height: 1.5; color: #4D4D4D; margin-top: 4px;">The full interactive dashboard, attached to this email. Nothing to sign in to. Switch between <b>1 week, 1 month, 3 months, 6 months, 1 year</b> and <b>All time</b> at the top, and click any bar, slice or part to see the work orders behind it.</div>
     <div style="${font} font-size: 12px; color: #6E6E6E; margin-top: 8px;">${mailEsc(fileName)} &middot; open it in Chrome, Edge or Safari. On a phone, save it first and open it from there.</div>`
  );
  const portal = showPortal
    ? step(
        2,
        "Or see it live on the portal",
        `<div style="${font} font-size: 13px; line-height: 1.5; color: #4D4D4D; margin-top: 4px;">The same dashboard with the numbers as they are right now, straight from the system.</div>
         <div style="margin-top: 12px;"><a href="${portalUrl}" style="${font} background: #E4002B; color: #ffffff; padding: 11px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Open the live dashboard</a></div>`
      )
    : "";
  return `
  <div style="background: #F4F4F4; padding: 24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden;">
      <tr><td style="background: #111111; padding: 18px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="48" valign="middle"><img src="${siteUrl("/mg-logo.png")}" width="40" height="40" alt="" style="display: block; background: #ffffff; border-radius: 10px; padding: 3px;"></td>
          <td valign="middle" style="${font} padding-left: 12px; color: #ffffff; font-size: 13px; letter-spacing: 0.4px; text-transform: uppercase; font-weight: bold;">Warranty Desk &middot; Sub-Dealer Weekly Report</td>
        </tr></table>
      </td></tr>
      <tr><td style="background: #E4002B; height: 4px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 24px 4px;">
        <div style="${font} font-size: 26px; font-weight: bold; color: #111111; line-height: 1.2;">Your week in numbers</div>
        <div style="${font} font-size: 13px; color: #6E6E6E; margin-top: 6px;">Exported ${mailEsc(exported)}</div>
      </td></tr>
      <tr><td style="padding: 14px 24px 6px; ${font} font-size: 15px; line-height: 1.6; color: #262626;">${introHtml}</td></tr>
      ${showTiles && tiles.length ? `<tr><td style="padding: 8px 19px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table></td></tr>` : ""}
      <tr><td style="padding: 20px 24px 6px;">
        <div style="${font} font-size: 12px; font-weight: bold; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E6E;">Explore it your way</div>
        <div style="background: #F7F7F8; border-radius: 14px; margin-top: 8px;">${attachment}</div>
        ${portal ? `<div style="background: #F7F7F8; border-radius: 14px; margin-top: 10px;">${portal}</div>` : ""}
      </td></tr>
      <tr><td style="padding: 18px 24px 24px; ${font} font-size: 11px; line-height: 1.5; color: #8A8A8A;">Revenue figures are as of the last time the dashboard was opened on the portal. This is an automated email, please do not reply to it.</td></tr>
    </table>
  </div>`;
}
