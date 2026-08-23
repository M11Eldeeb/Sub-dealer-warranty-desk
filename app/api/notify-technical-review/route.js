import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: requesterProfile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(requesterProfile?.role)) {
    return NextResponse.json({ error: "Not authorized to trigger this notification." }, { status: 403 });
  }

  const { claimId } = await request.json();
  if (!claimId) {
    return NextResponse.json({ error: "Missing claim id." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email is not configured (missing RESEND_API_KEY)." }, { status: 500 });
  }

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("claims")
    .select("claim_number, work_order_number, dealer_work_order_number, vin, branches(name)")
    .eq("id", claimId)
    .single();
  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  // Find every technical_team and admin account, and look up their real emails via the admin API
  // (profiles doesn't store email — only auth.users does, and that's only readable with the service role).
  const { data: recipientProfiles } = await admin.from("profiles").select("id, role").in("role", ["technical_team", "admin"]);

  const toEmails = [];
  const ccEmails = new Set();
  if (user.email) ccEmails.add(user.email);

  for (const p of recipientProfiles || []) {
    const { data: authUserResult } = await admin.auth.admin.getUserById(p.id);
    const email = authUserResult?.user?.email;
    if (!email) continue;
    if (p.role === "technical_team") toEmails.push(email);
    else ccEmails.add(email);
  }

  if (toEmails.length === 0) {
    return NextResponse.json({ error: "No technical team accounts exist to notify." }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const claimLink = siteUrl ? `${siteUrl.replace(/\/$/, "")}/claims/${claimId}` : null;

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
      <p>A claim needs technical verification before the dealer can move forward with it.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">Claim</td><td><b>${claim.claim_number}</b></td></tr>
        <tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">Branch</td><td>${claim.branches?.name || "—"}</td></tr>
        <tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">VIN</td><td>${claim.vin}</td></tr>
        <tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">Work Order (Sub-Dealer)</td><td>${claim.work_order_number}</td></tr>
        ${
          claim.dealer_work_order_number
            ? `<tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">Work Order (Dealer)</td><td>${claim.dealer_work_order_number}</td></tr>`
            : ""
        }
        <tr><td style="padding: 3px 12px 3px 0; color: #6E6E6E;">Requested by</td><td>${requesterProfile.full_name}</td></tr>
      </table>
      ${
        claimLink
          ? `<p><a href="${claimLink}" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open the claim</a></p>`
          : `<p>Log in to WarrantyDesk to review it.</p>`
      }
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "WarrantyDesk <onboarding@resend.dev>",
        to: toEmails,
        cc: Array.from(ccEmails),
        subject: `Technical Verification Needed — Claim ${claim.claim_number}`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Email provider rejected the send: ${errText}` }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not reach the email provider: ${err.message}` }, { status: 502 });
  }

  return NextResponse.json({ success: true, notified: toEmails.length, cced: ccEmails.size });
}
