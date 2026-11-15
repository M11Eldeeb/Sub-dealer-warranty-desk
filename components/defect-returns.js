"use client";

/** Defected parts returns: statuses and the table that adapts to phones. */

export const DR_STATUS = {
  submitted: { label: "Waiting for check", color: "#8F5500", bg: "#FCF1DA" },
  completed: { label: "Checked", color: "#1E6B35", bg: "#E5F3E8" },
  cancelled: { label: "Cancelled", color: "#696969", bg: "#F1F2F4" },
};

export const DECISION = {
  pending: { label: "Not checked yet", color: "#696969", bg: "#F1F2F4" },
  arrived: { label: "Arrived", color: "#1E6B35", bg: "#E5F3E8" },
  not_received: { label: "Not received", color: "#A63A32", bg: "#FAE4E2" },
};

export function Chip({ spec }) {
  return (
    <span className="pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.6875rem] font-bold whitespace-nowrap" style={{ "--pill-fg": spec.color, "--pill-bg": spec.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: spec.color }} />
      {spec.label}
    </span>
  );
}

/** Scrap marks, read from the Warranty Self-Audit system (Verification Date + 90 days). */
export const SCRAP = {
  yes: { label: "Can be scrapped", color: "#1E6B35", bg: "#E5F3E8" },
  no: { label: "Can't be scrapped", color: "#A63A32", bg: "#FAE4E2" },
};

const dateText = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The mark for a whole return: info = { canScrap } from /api/defect-returns/scrap-status. */
export const ScrapChip = ({ info }) => (info ? <Chip spec={info.canScrap ? SCRAP.yes : SCRAP.no} /> : null);

/** One line saying why a single claim can or can not be scrapped. r = the claim's result from the same answer. */
export function scrapReason(r) {
  if (!r) return "";
  switch (r.status) {
    case "can_scrap":
      return "Held more than 90 days since verification";
    case "already_scrapped":
      return "Already scrapped";
    case "not_yet":
      return `Can be scrapped from ${dateText(r.eligible_on)} (verified ${dateText(r.verification_date)})`;
    case "not_verified":
      return `Not verified yet${r.batch_status ? ` (${r.batch_status})` : ""}`;
    case "reserved":
      return "Reserved for the supplier";
    case "no_parts":
      return "The self-audit claim has no parts";
    case "not_found":
      return "Not in the self-audit batch";
    case "ambiguous":
      return "Another claim shares this work order. Check by hand";
    default:
      return "";
  }
}

/** The line under a return's mark. */
export function scrapSummary(info) {
  if (!info) return "";
  if (info.canScrap) return `All ${info.total} claim${info.total === 1 ? "" : "s"} are past the 90 days`;
  if (info.eligibleFrom) return `Can be scrapped from ${dateText(info.eligibleFrom)}`;
  return `${info.ready} of ${info.total} claim${info.total === 1 ? "" : "s"} can be scrapped`;
}

export const DrStatusTag = ({ status }) => <Chip spec={DR_STATUS[status] || DR_STATUS.submitted} />;
export const DecisionChip = ({ decision }) => <Chip spec={DECISION[decision] || DECISION.pending} />;

/**
 * A table on wide screens; on a phone every row becomes a small card with "label: value" lines.
 * columns: [{ key, label, render(row), hideLabelOnCard?, cardTitle? }]
 */
export function ResponsiveRows({ columns, rows, rowKey, rowClass = () => "" }) {
  return (
    <>
      <div className="hidden sm:block overflow-x-auto border border-[#E0E0E0] rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#6E6E6E] bg-[#FAFAFA]">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2.5 font-semibold ${c.className || ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {rows.map((row) => (
              <tr key={rowKey(row)} className={rowClass(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 align-middle ${c.className || ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="sm:hidden space-y-2">
        {rows.map((row) => (
          <li key={rowKey(row)} className={`border border-[#E0E0E0] rounded-lg bg-white p-3 space-y-1.5 ${rowClass(row)}`}>
            {columns.map((c) => (
              <div key={c.key} className={c.cardTitle ? "" : "flex items-start justify-between gap-3 text-sm"}>
                {!c.cardTitle && !c.hideLabelOnCard && <span className="text-xs text-[#6E6E6E] shrink-0 pt-0.5">{c.label}</span>}
                <div className={c.cardTitle ? "" : "min-w-0 text-right break-words"}>{c.render(row)}</div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
