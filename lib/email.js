export async function sendEmail({ to, cc, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email is not configured (missing RESEND_API_KEY).");
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

export function claimLinkButton(claimId) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return `<p>Log in to WarrantyDesk to review it.</p>`;
  const link = `${siteUrl.replace(/\/$/, "")}/claims/${claimId}`;
  return `<p><a href="${link}" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open the claim</a></p>`;
}
