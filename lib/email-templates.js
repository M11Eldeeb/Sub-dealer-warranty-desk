// SERVER-ONLY. The e-mails the site sends on its own, and the settings an admin can edit for each
// (on / off, subject, body, who it goes to, who is copied). Defaults live here; the email_templates table
// only holds what was changed (a null column means "use the default").
import { claimInfoTable, claimLinkButton, claimUrl, linkButton, rowsTable, sendEmail } from "@/lib/email";

const ROLE_LABELS = { admin: "Admin", manager: "Manager", dealer: "Dealer", technical_team: "Technical Team", parts_team: "Parts Team", sub_dealer: "Sub-Dealer" };
export const RECIPIENT_ROLES = Object.keys(ROLE_LABELS);

const emptyList = () => ({ roles: [], users: [], extra: [] });

export const TEMPLATE_DEFAULTS = {
  technical_review: {
    label: "Sent to technical team",
    when: "Sent as soon as a claim is sent to the technical team for approval.",
    showParts: false,
    subject: "Technical Verification Needed — {work_orders}",
    body: "A claim from {branch} needs technical verification before the dealer can move forward with it.\n\nRequested by: {requested_by}\n\nOpen the claim in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["technical_team"] }, cc: { ...emptyList(), roles: ["admin", "manager"], trigger: false } },
  },
  technical_reminder: {
    label: "Technical team reminder",
    when: "Only if the technical team has not responded on the website: sent once a day while the claim is still in Technical Review. Stops as soon as they approve or return it.",
    showParts: false,
    subject: "Reminder: Technical Verification Needed — {work_orders}",
    body: "Reminder: this claim from {branch} is still waiting on technical verification.\n\nOpen the claim in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["technical_team"] }, cc: { ...emptyList(), roles: ["admin"], trigger: false } },
  },
  parts_needed: {
    label: "Claim approved - parts needed",
    when: "Sent as soon as a claim is approved and is waiting for parts.",
    showParts: true,
    subject: "Sub-Dealer Parts Needed - Work Order {dealer_work_order} - {branch}",
    body: "A claim was just approved for {branch}. Please open the portal and deliver the part(s) to the sub-dealer branch.\n\nOpen the claim in the portal: {portal_link}\n\nPlease select the correct part status on the portal as the work progresses (Waiting Action, ICT, VOR, Supplied to Sub-Dealer). Reminders stop only when every part is Supplied to Sub-Dealer.\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["parts_team"] }, cc: { ...emptyList(), trigger: false } },
  },
  parts_reminder: {
    label: "Parts team reminder",
    when: "Only while parts are still outstanding. Sent every day at 9:00 AM while a part is still Waiting Action (nobody has touched it), and every 5 days while parts are stuck on ICT or VOR. Starts after approval (1 day / 5 days). Stops once every part is Supplied to Sub-Dealer.",
    showParts: true,
    subject: "Reminder: Sub-Dealer Parts Needed - Work Order {dealer_work_order} - {branch}",
    body: "Reminder: this claim for {branch} still has parts that have not been supplied to the sub-dealer branch (listed below). Please open the portal, deliver the part(s) to the sub-dealer branch and select the correct part status (Waiting Action, ICT, VOR, Supplied to Sub-Dealer).\n\nOpen the claim in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["parts_team"] }, cc: { ...emptyList(), trigger: false } },
  },
  claim_returned: {
    label: "Claim returned to sub-dealer",
    when: "Sent to the sub-dealer's branch accounts as soon as a claim is returned for edit.",
    showParts: false,
    subject: "Claim Returned for Edit — {work_orders}",
    body: "Your claim {work_orders} was returned for edit by the dealer.\n\nReason: {reason}\n\nPlease open the claim in the portal, correct it and resubmit it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  repair_returned: {
    label: "After-repair evidence returned",
    when: "Sent to the sub-dealer's branch accounts as soon as the after-repair evidence is returned.",
    showParts: false,
    subject: "After-Repair Evidence Returned — {work_orders}",
    body: "The after-repair evidence for claim {work_orders} was returned by the dealer.\n\nReason: {reason}\n\nPlease open the claim in the portal, correct the after-repair evidence and submit it again:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  returned_reminder: {
    label: "Returned claim reminder",
    when: "Only while the sub-dealer has not responded on the website: sent every day while the claim is still returned (for edit, or after-repair evidence). Stops as soon as they resubmit.",
    showParts: false,
    subject: "Reminder: Claim Still Returned — {work_orders}",
    body: "Reminder: this claim is still {return_type} and is waiting for your action.\n\nLast reason given: {reason}\n\nPlease open the claim in the portal and resubmit it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_submitted: {
    group: "Free Service",
    label: "Free Service requested",
    when: "Sent to the dealer as soon as a sub-dealer requests a Free Service approval.",
    showParts: false,
    subject: "Free Service Approval Requested — {work_orders}",
    body: "{branch} requested a Free Service approval.\n\nPlease review it and approve, return it for edit or reject it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["dealer"] }, cc: { ...emptyList(), roles: ["admin"], trigger: false } },
  },
  fs_approved: {
    group: "Free Service",
    label: "Free Service approved",
    when: "Sent to the sub-dealer's branch accounts when the request is approved.",
    showParts: false,
    subject: "Free Service Approved — {work_orders}",
    body: "Your Free Service request {work_orders} was approved.\n\nApproved amount: {amount}\n\nPlease upload the invoice in the portal so we can complete it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_returned: {
    group: "Free Service",
    label: "Free Service returned for edit",
    when: "Sent to the sub-dealer's branch accounts when the request is returned for edit.",
    showParts: false,
    subject: "Free Service Returned for Edit — {work_orders}",
    body: "Your Free Service request {work_orders} was returned for edit.\n\nReason: {reason}\n\nPlease correct it and resubmit it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_rejected: {
    group: "Free Service",
    label: "Free Service rejected",
    when: "Sent to the sub-dealer's branch accounts when the request is rejected.",
    showParts: false,
    subject: "Free Service Rejected — {work_orders}",
    body: "Your Free Service request {work_orders} was rejected.\n\nReason: {reason}\n\nOpen it in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_invoice_submitted: {
    group: "Free Service",
    label: "Free Service invoice submitted",
    when: "Sent to the dealer when the sub-dealer uploads the invoice.",
    showParts: false,
    subject: "Free Service Invoice Submitted — {work_orders}",
    body: "{branch} uploaded the invoice for Free Service {work_orders}. Approved amount: {amount}.\n\nPlease review it and approve, return it for edit or reject it:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["dealer"] }, cc: { ...emptyList(), roles: ["admin"], trigger: false } },
  },
  fs_invoice_returned: {
    group: "Free Service",
    label: "Free Service invoice returned",
    when: "Sent to the sub-dealer's branch accounts when the invoice is returned for edit.",
    showParts: false,
    subject: "Free Service Invoice Returned — {work_orders}",
    body: "The invoice for your Free Service {work_orders} was returned.\n\nReason: {reason}\n\nPlease upload the corrected invoice:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_completed: {
    group: "Free Service",
    label: "Free Service completed",
    when: "Sent to the sub-dealer's branch accounts when the invoice is approved and the request is complete.",
    showParts: false,
    subject: "Free Service Completed — {work_orders}",
    body: "The invoice for your Free Service {work_orders} was approved. The request is complete.\n\nApproved amount: {amount}\n\nOpen it in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
  fs_cancelled: {
    group: "Free Service",
    label: "Free Service cancelled",
    when: "Sent to the dealer when a sub-dealer cancels a returned request.",
    showParts: false,
    subject: "Free Service Cancelled — {work_orders}",
    body: "{branch} cancelled their Free Service request {work_orders}.\n\nOpen it in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["dealer"] }, cc: { ...emptyList(), roles: ["admin"], trigger: false } },
  },
  dr_submitted: {
    group: "Defected parts",
    label: "Defected parts return requested",
    when: "Sent to the warranty officers when a sub-dealer sends a defected parts return request.",
    showParts: false,
    subject: "Defected Parts Return {return_number} — {branch}",
    body: "{branch} sent a defected parts return request ({summary}).\n\nPlease check the parts when they arrive and mark each one as arrived:\n{portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["dealer"] }, cc: { ...emptyList(), roles: ["admin"], trigger: false } },
  },
  dr_completed: {
    group: "Defected parts",
    label: "Defected parts return checked",
    when: "Sent to the sub-dealer's branch accounts once every part of their return request has been checked.",
    showParts: false,
    subject: "Defected Parts Return {return_number} Checked",
    body: "Your defected parts return {return_number} was checked: {summary}.\n\nOpen it in the portal: {portal_link}\n\nThis is an automated email - please do not reply to it. Use the portal.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), branch: true }, cc: { ...emptyList(), trigger: true } },
  },
};

export const PLACEHOLDERS = [
  ["{claim_number}", "Claim number"],
  ["{branch}", "Sub-dealer branch"],
  ["{vin}", "VIN"],
  ["{work_order}", "Sub-dealer work order"],
  ["{dealer_work_order}", "Dealer work order"],
  ["{work_orders}", "Sub-dealer and dealer work order"],
  ["{portal_link}", "Link to the claim in the portal"],
  ["{requested_by}", "Person who triggered it"],
  ["{parts}", "List of parts"],
  ["{reason}", "Reason given when it was returned / rejected"],
  ["{amount}", "Approved amount (Free Service)"],
  ["{service}", "Service requested (Free Service)"],
  ["{return_number}", "Defected parts return number"],
  ["{summary}", "What the return contains / how it was checked"],
  ["{return_type}", "What was returned (claim for edit / after-repair evidence)"],
];

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

function normalizeList(list, { withTrigger }) {
  const strings = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    roles: strings(list?.roles).filter((r) => RECIPIENT_ROLES.includes(r)),
    users: strings(list?.users),
    extra: strings(list?.extra).map((e) => e.toLowerCase()),
    branch: !!list?.branch,
    ...(withTrigger ? { trigger: !!list?.trigger } : {}),
  };
}

/** Checks and cleans what the settings page sends. Returns { value } or { error }. */
export function validateTemplateInput(key, input) {
  const def = TEMPLATE_DEFAULTS[key];
  if (!def) return { error: "Unknown email." };
  const subject = String(input?.subject ?? "").trim();
  const body = String(input?.body ?? "").trim();
  if (!subject) return { error: "The subject cannot be empty." };
  if (subject.length > 300) return { error: "The subject is too long." };
  if (!body) return { error: "The message cannot be empty." };
  if (body.length > 5000) return { error: "The message is too long." };
  const config = { to: normalizeList(input?.config?.to, {}), cc: normalizeList(input?.config?.cc, { withTrigger: true }) };
  const bad = [...config.to.extra, ...config.cc.extra].find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" is not a valid email address.` };
  return {
    value: {
      enabled: input?.enabled !== false,
      subject,
      body,
      include_details: input?.include_details !== false,
      include_button: input?.include_button !== false,
      config,
    },
  };
}

/** The template as it applies right now: the saved row on top of the defaults. */
export async function loadTemplate(admin, key) {
  const def = TEMPLATE_DEFAULTS[key];
  const { data: row } = await admin.from("email_templates").select("*").eq("key", key).maybeSingle();
  return {
    key,
    label: def.label,
    group: def.group ?? "Claims",
    when: def.when,
    showParts: def.showParts,
    enabled: row ? row.enabled : true,
    subject: row?.subject ?? def.subject,
    body: row?.body ?? def.body,
    include_details: row?.include_details ?? def.include_details,
    include_button: row?.include_button ?? def.include_button,
    config: {
      to: normalizeList(row?.config?.to ?? def.config.to, {}),
      cc: normalizeList(row?.config?.cc ?? def.config.cc, { withTrigger: true }),
    },
    updatedAt: row?.updated_at ?? null,
  };
}

/** Every account with its e-mail, for the recipient pickers and for resolving who gets a mail. */
export async function listUserDirectory(admin) {
  const [{ data: profiles }, emails] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, branch_id"),
    (async () => {
      const map = new Map();
      for (let page = 1; page <= 20; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const u of data?.users ?? []) map.set(u.id, u.email);
        if ((data?.users?.length ?? 0) < 200) break;
      }
      return map;
    })(),
  ]);
  return (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role, branchId: p.branch_id, email: emails.get(p.id) ?? null })).filter((u) => u.email);
}

// Who is listed first in To / Cc, whoever is actually in the email. The named people come first, in this order;
// then whole roles (technical team, parts team, ...). If a group is missing from an email the next one simply moves up.
const SENIORITY = ["mustafa.nasr@jiadmotors.com", "ahmad.mustafa@jiadmotors.com", "mostafa.eldeeb@jiadmotors.com", "ahmad.hamdani@jiadmotors.com"];
const ROLE_ORDER = ["manager", "admin", "dealer", "technical_team", "parts_team", "sub_dealer"];

/** Sort key: named seniors first, then by role, then addresses typed in by hand, then alphabetical. */
function rankOf(email, roleByEmail) {
  const named = SENIORITY.indexOf(email);
  if (named >= 0) return named;
  const role = roleByEmail.get(email);
  const r = ROLE_ORDER.indexOf(role);
  return SENIORITY.length + (r >= 0 ? r : ROLE_ORDER.length);
}

/** Turns the saved To / Cc choices into addresses, in priority order. `triggerEmail` is the person who caused the mail. */
export function resolveRecipients(template, directory, triggerEmail, claimBranchId) {
  const roleByEmail = new Map(directory.map((u) => [u.email.toLowerCase(), u.role]));
  const pick = (list, trigger) => {
    const out = new Set(list.extra);
    for (const u of directory) {
      const inBranch = list.branch && claimBranchId && u.role === "sub_dealer" && u.branchId === claimBranchId;
      if (list.roles.includes(u.role) || list.users.includes(u.id) || inBranch) out.add(u.email.toLowerCase());
    }
    if (trigger && triggerEmail) out.add(triggerEmail.toLowerCase());
    return [...out].sort((x, y) => rankOf(x, roleByEmail) - rankOf(y, roleByEmail) || x.localeCompare(y));
  };
  const to = pick(template.config.to, false);
  const cc = pick(template.config.cc, template.config.cc.trigger).filter((e) => !to.includes(e));
  return { to, cc };
}

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fill(text, values, escape) {
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in values ? (escape ? escapeHtml(values[name]) : values[name]) : m));
}

/** Subject + HTML for a claim, using the template's current wording. */
export function renderTemplate(template, claim, { requestedBy = "", claimId, reason = "", returnType = "", custom = null } = {}) {
  const partsList = (claim.claim_parts || []).map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty}`);
  const values = {
    claim_number: claim.claim_number ?? "",
    branch: claim.branches?.name || "this branch",
    vin: claim.vin ?? "",
    work_order: claim.work_order_number ?? "",
    dealer_work_order: claim.dealer_work_order_number ?? "",
    work_orders: `Sub-Dealer WO ${claim.work_order_number ?? ""}${claim.dealer_work_order_number ? ` / Dealer WO ${claim.dealer_work_order_number}` : ""}`,
    portal_link: claimUrl(claimId ?? claim.id, claim.kind),
    requested_by: requestedBy,
    parts: partsList.join(", "),
    reason: reason || "(no reason given)",
    return_type: returnType,
    service: claim.service_requested || "",
    amount: claim.approved_amount != null ? `SAR ${Number(claim.approved_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
  };
  if (custom) Object.assign(values, custom.values || {}, { portal_link: custom.url });
  // Web addresses in the message (the portal link) become clickable.
  const bodyHtml = escapeHtml(fill(template.body, values, false))
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#E4002B;">${url}</a>`)
    .replace(/\r?\n/g, "<br/>");
  const extraRows = template.showParts && partsList.length ? [["Parts needed", partsList.map(escapeHtml).join("<br/>")]] : [];
  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
      <p>${bodyHtml}</p>
      ${template.include_details ? (custom ? rowsTable(custom.infoRows || []) : claimInfoTable(claim, extraRows)) : ""}
      ${template.include_button ? (custom ? linkButton(custom.url, "Open in the portal") : claimLinkButton(claimId ?? claim.id, claim.kind)) : ""}
    </div>
  `;
  return { subject: fill(template.subject, values, false).replace(/[\r\n]+/g, " "), html };
}

/**
 * Sends one of the automatic e-mails for a claim using its saved settings.
 * Returns { skipped: true } when it is switched off; throws a readable error when it cannot be sent
 * (nobody to send to, mailbox not connected...).
 */
export async function sendTemplatedEmail(admin, key, { claim, claimId, trigger, reason, returnType, custom }) {
  const template = await loadTemplate(admin, key);
  if (!template.enabled) return { skipped: true };
  const directory = await listUserDirectory(admin);
  const who = trigger?.id ? directory.find((u) => u.id === trigger.id) : null;
  const triggerInfo = { id: trigger?.id ?? null, email: trigger?.email ?? who?.email ?? null, name: trigger?.name ?? who?.name ?? "" };
  const { to, cc } = resolveRecipients(template, directory, triggerInfo.email, claim.branch_id);
  if (to.length === 0) throw new Error(`The "${template.label}" email has nobody in its To list - add recipients in Settings.`);
  const { subject, html } = renderTemplate(template, claim, { requestedBy: triggerInfo.name, claimId, reason, returnType, custom });
  await sendEmail({ to, cc, subject, html, kind: key, sentBy: triggerInfo.id });
  return { sent: true, to, cc };
}

/** The last time the claim moved into `status`: when, and the note the dealer typed (used by reminders). */
export async function latestStatusEntry(admin, claimId, status) {
  const { data } = await admin
    .from("claim_status_log")
    .select("note, at")
    .eq("claim_id", claimId)
    .eq("to_status", status)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { note: data?.note ?? "", at: data?.at ?? null };
}
