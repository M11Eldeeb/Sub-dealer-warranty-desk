import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/require-manager";
import { PLACEHOLDERS, RECIPIENT_ROLES, TEMPLATE_DEFAULTS, listUserDirectory, loadTemplate, validateTemplateInput } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/** Every automatic email with its current settings, plus the accounts that can be picked as recipients. */
export async function GET() {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const admin = createAdminClient();
  const keys = Object.keys(TEMPLATE_DEFAULTS);
  const [templates, directory] = await Promise.all([Promise.all(keys.map((k) => loadTemplate(admin, k))), listUserDirectory(admin)]);
  return NextResponse.json({
    templates,
    users: directory.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    roles: RECIPIENT_ROLES,
    placeholders: PLACEHOLDERS,
  });
}

/** Saves one email's settings. */
export async function PUT(request) {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const input = await request.json().catch(() => null);
  const checked = validateTemplateInput(input?.key, input);
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").upsert({ key: input.key, ...checked.value, updated_at: new Date().toISOString(), updated_by: who.user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: await loadTemplate(admin, input.key) });
}

/** Puts one email back to its default wording and recipients. */
export async function DELETE(request) {
  const who = await requireManager();
  if (who.error) return NextResponse.json({ error: who.error }, { status: who.status });

  const key = new URL(request.url).searchParams.get("key");
  if (!TEMPLATE_DEFAULTS[key]) return NextResponse.json({ error: "Unknown email." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: await loadTemplate(admin, key) });
}
