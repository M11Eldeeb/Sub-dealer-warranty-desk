// SERVER-ONLY. The e-mails the site sends on its own, and the settings an admin can edit for each
// (on / off, subject, body, who it goes to, who is copied). Defaults live here; the email_templates table
// only holds what was changed (a null column means "use the default").
import { claimInfoTable, claimLinkButton, sendEmail } from "@/lib/email";

const ROLE_LABELS = { admin: "Admin", dealer: "Dealer", technical_team: "Technical Team", parts_team: "Parts Team", sub_dealer: "Sub-Dealer" };
export const RECIPIENT_ROLES = Object.keys(ROLE_LABELS);

const emptyList = () => ({ roles: [], users: [], extra: [] });

export const TEMPLATE_DEFAULTS = {
  technical_review: {
    label: "Sent to technical team",
    when: "Sent as soon as a claim is sent to the technical team for approval.",
    showParts: false,
    subject: "Technical Verification Needed — Claim {claim_number}",
    body: "A claim needs technical verification before the dealer can move forward with it.\n\nRequested by: {requested_by}",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["technical_team"] }, cc: { ...emptyList(), roles: ["admin"], trigger: true } },
  },
  technical_reminder: {
    label: "Technical team reminder",
    when: "Only if the technical team has not responded on the website: sent once a day while the claim is still in Technical Review. Stops as soon as they approve or return it.",
    showParts: false,
    subject: "Reminder: Technical Verification Needed — Claim {claim_number}",
    body: "Reminder: this claim is still waiting on technical verification.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["technical_team"] }, cc: { ...emptyList(), roles: ["admin"], trigger: true } },
  },
  parts_needed: {
    label: "Claim approved - parts needed",
    when: "Sent as soon as a claim is approved and is waiting for parts.",
    showParts: true,
    subject: "Parts Needed — Claim {claim_number} ({branch})",
    body: "A claim was just approved for {branch}. Please open the portal and deliver the part(s) to the sub-dealer branch.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["parts_team"] }, cc: { ...emptyList(), trigger: false } },
  },
  parts_reminder: {
    label: "Parts team reminder",
    when: "Only if the parts team has not responded on the website: sent once, 24 hours after approval, and only if no part status has been changed yet.",
    showParts: true,
    subject: "Reminder: Parts Needed — Claim {claim_number} ({branch})",
    body: "Reminder: this claim has been waiting on parts action for over 24 hours, for {branch}. Please open the portal and deliver the part(s) to the sub-dealer branch.",
    include_details: true,
    include_button: true,
    config: { to: { ...emptyList(), roles: ["parts_team"] }, cc: { ...emptyList(), trigger: false } },
  },
};

export const PLACEHOLDERS = [
  ["{claim_number}", "Claim number"],
  ["{branch}", "Sub-dealer branch"],
  ["{vin}", "VIN"],
  ["{work_order}", "Sub-dealer work order"],
  ["{dealer_work_order}", "Dealer work order"],
  ["{requested_by}", "Person who triggered it"],
  ["{parts}", "List of parts"],
];

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

function normalizeList(list, { withTrigger }) {
  const strings = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    roles: strings(list?.roles).filter((r) => RECIPIENT_ROLES.includes(r)),
    users: strings(list?.users),
    extra: strings(list?.extra).map((e) => e.toLowerCase()),
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
    admin.from("profiles").select("id, full_name, role"),
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
  return (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role, email: emails.get(p.id) ?? null })).filter((u) => u.email);
}

/** Turns the saved To / Cc choices into addresses. `triggerEmail` is the person who caused the mail. */
export function resolveRecipients(template, directory, triggerEmail) {
  const pick = (list, trigger) => {
    const out = new Set(list.extra);
    for (const u of directory) if (list.roles.includes(u.role) || list.users.includes(u.id)) out.add(u.email.toLowerCase());
    if (trigger && triggerEmail) out.add(triggerEmail.toLowerCase());
    return [...out];
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
export function renderTemplate(template, claim, { requestedBy = "", claimId } = {}) {
  const partsList = (claim.claim_parts || []).map((p) => `${p.name}${p.part_number ? ` (${p.part_number})` : ""} x${p.qty}`);
  const values = {
    claim_number: claim.claim_number ?? "",
    branch: claim.branches?.name || "this branch",
    vin: claim.vin ?? "",
    work_order: claim.work_order_number ?? "",
    dealer_work_order: claim.dealer_work_order_number ?? "",
    requested_by: requestedBy,
    parts: partsList.join(", "),
  };
  const bodyHtml = escapeHtml(fill(template.body, values, false)).replace(/\r?\n/g, "<br/>");
  const extraRows = template.showParts && partsList.length ? [["Parts needed", partsList.map(escapeHtml).join("<br/>")]] : [];
  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111;">
      <p>${bodyHtml}</p>
      ${template.include_details ? claimInfoTable(claim, extraRows) : ""}
      ${template.include_button ? claimLinkButton(claimId ?? claim.id) : ""}
    </div>
  `;
  return { subject: fill(template.subject, values, false).replace(/[\r\n]+/g, " "), html };
}

/**
 * Sends one of the automatic e-mails for a claim using its saved settings.
 * Returns { skipped: true } when it is switched off; throws a readable error when it cannot be sent
 * (nobody to send to, mailbox not connected...).
 */
export async function sendTemplatedEmail(admin, key, { claim, claimId, trigger }) {
  const template = await loadTemplate(admin, key);
  if (!template.enabled) return { skipped: true };
  const directory = await listUserDirectory(admin);
  const who = trigger?.id ? directory.find((u) => u.id === trigger.id) : null;
  const triggerInfo = { id: trigger?.id ?? null, email: trigger?.email ?? who?.email ?? null, name: trigger?.name ?? who?.name ?? "" };
  const { to, cc } = resolveRecipients(template, directory, triggerInfo.email);
  if (to.length === 0) throw new Error(`The "${template.label}" email has nobody in its To list - add recipients in Settings.`);
  const { subject, html } = renderTemplate(template, claim, { requestedBy: triggerInfo.name, claimId });
  await sendEmail({ to, cc, subject, html, kind: key, sentBy: triggerInfo.id });
  return { sent: true, to, cc };
}
