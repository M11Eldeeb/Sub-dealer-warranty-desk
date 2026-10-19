import { getMailStatus, sendMail } from "@/lib/gmail";

/**
 * Sends one e-mail. Uses the company Gmail mailbox when an admin has connected it (Settings in the menu),
 * otherwise falls back to Resend if RESEND_API_KEY is set. Throws with a readable message when neither works.
 */
export async function sendEmail({ to, cc, subject, html, kind = "notice", sentBy = null }) {
  if (await getMailStatus()) {
    const result = await sendMail({ kind, to, cc, subject, html, sentBy });
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
      from: process.env.RESEND_FROM_EMAIL || "WarrantyDesk <onboarding@resend.dev>",
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email provider rejected the send: ${errText}`);
  }
}

export function claimInfoTable(claim, extraRows = []) {
  const rows = [
    ["Claim", `<b>${claim.claim_number}</b>`],
    ["Branch", claim.branches?.name || "—"],
    ["VIN", claim.vin],
    ["Work Order (Sub-Dealer)", claim.work_order_number],
    ...(claim.dealer_work_order_number ? [["Work Order (Dealer)", claim.dealer_work_order_number]] : []),
    ...extraRows,
  ];
  return `<table style="border-collapse: collapse; margin: 12px 0;">${rows
    .map(([label, value]) => `<tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">${label}</td><td>${value}</td></tr>`)
    .join("")}</table>`;
}

const DEFAULT_SITE_URL = "https://sub-dealer-warranty-desk.vercel.app";

/** The full web address of a claim in the portal. */
export function claimUrl(claimId) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return `${siteUrl.replace(/\/$/, "")}/claims/${claimId}`;
}

export function claimLinkButton(claimId) {
  const link = claimUrl(claimId);
  return `<p><a href="${link}" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open the claim</a></p>`;
}
