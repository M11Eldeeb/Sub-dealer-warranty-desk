import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

const EVENTS = {
  submitted: { key: "dr_submitted", by: ["sub_dealer"], status: "submitted" },
  completed: { key: "dr_completed", by: ["dealer", "admin"], status: "completed" },
};

/** E-mails about a defected parts return: the request itself (to the officers) and its result (to the sub-dealer). */
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();

  const { returnId, event } = (await request.json().catch(() => ({}))) || {};
  const step = EVENTS[event];
  if (!returnId || !step) return NextResponse.json({ error: "Missing return or event." }, { status: 400 });
  if (!step.by.includes(me?.role)) return NextResponse.json({ error: "Not authorized to trigger this notification." }, { status: 403 });

  const { data: visible } = await supabase.from("defect_returns").select("id").eq("id", returnId).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: ret } = await admin
    .from("defect_returns")
    .select("id, return_number, status, branch_id, note, created_at, branches(name), defect_return_items(decision, claims(claim_number), claim_parts(name, part_number))")
    .eq("id", returnId)
    .single();
  if (!ret) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (ret.status !== step.status) return NextResponse.json({ error: "The request is not in that status." }, { status: 409 });

  const items = ret.defect_return_items || [];
  const claimCount = new Set(items.map((i) => i.claims?.claim_number)).size;
  const arrived = items.filter((i) => i.decision === "arrived").length;
  const missing = items.filter((i) => i.decision === "not_received");
  const summary =
    event === "submitted"
      ? `${items.length} part${items.length === 1 ? "" : "s"} from ${claimCount} claim${claimCount === 1 ? "" : "s"}`
      : `${arrived} of ${items.length} part${items.length === 1 ? "" : "s"} arrived${missing.length ? `; not received: ${missing.map((i) => `${i.claim_parts?.name} (${i.claims?.claim_number})`).join(", ")}` : ""}`;

  const url = siteUrl(`/defect-returns/${ret.id}`);
  const infoRows = [
    ["Return", `<b>${ret.return_number}</b>`],
    ["Branch", ret.branches?.name || "—"],
    ["Claims", String(claimCount)],
    ["Parts", event === "submitted" ? String(items.length) : `${arrived} of ${items.length} arrived`],
    ...(ret.note ? [["Note", ret.note.replace(/</g, "&lt;")]] : []),
  ];

  try {
    const result = await sendTemplatedEmail(admin, step.key, {
      claim: { id: ret.id, kind: "defect_return", branch_id: ret.branch_id, claim_number: ret.return_number, branches: ret.branches },
      claimId: ret.id,
      trigger: { id: user.id, email: user.email, name: me.full_name },
      custom: { url, infoRows, values: { return_number: ret.return_number, summary } },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
