import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/require-manager";
import { getMailStatus, sendMail } from "@/lib/gmail";
import { TEMPLATE_DEFAULTS, renderTemplate, validateTemplateInput } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/** Sends the email as currently typed (saved or not) to the signed-in person only, filled with sample claim data. */
export async function POST(request) {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });
  if (!who.user.email) return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
  if (!(await getMailStatus())) return NextResponse.json({ error: "The email sender is not connected yet." }, { status: 409 });

  const input = await request.json().catch(() => null);
  const checked = validateTemplateInput(input?.key, input);
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });

  // A real claim is the sample when there is one, so the test looks like the real thing.
  const admin = createAdminClient();
  const { data: sample } = await admin
    .from("claims")
    .select("id, claim_number, work_order_number, dealer_work_order_number, vin, branches(name), claim_parts(name, part_number, qty)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const claim = sample ?? {
    id: "sample",
    claim_number: "WC-0000",
    work_order_number: "SAMPLE-1",
    dealer_work_order_number: "SAMPLE-2",
    vin: "SAMPLEVIN0000000",
    branches: { name: "Sample Branch" },
    claim_parts: [{ name: "Sample part", part_number: "123", qty: 1 }],
  };

  const template = { ...TEMPLATE_DEFAULTS[input.key], ...checked.value };
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", who.user.id).maybeSingle();
  const { subject, html } = renderTemplate(template, claim, {
    requestedBy: profile?.full_name ?? "",
    claimId: claim.id,
    reason: "Sample reason: the photos are not clear, please attach new ones.",
    returnType: "returned for edit",
  });
  const result = await sendMail({ kind: "test", to: [who.user.email], subject: `[TEST] ${subject}`, html, sentBy: who.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ sentTo: who.user.email });
}
