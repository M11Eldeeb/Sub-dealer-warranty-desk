// The claim statuses: label and colours. Kept apart from components/ui.js so the dashboard file sent by e-mail can use it without the whole interface.
export const STATUS = {
  draft: { label: "Draft", color: "#656970", bg: "#F1F2F4" },
  submitted: { label: "Submitted", color: "#9A5C00", bg: "#FCF1DA" },
  waiting_pa: { label: "Waiting PA", color: "#AB4F09", bg: "#FDF0DC" },
  returned: { label: "Returned for Edit", color: "#A84917", bg: "#FDEBE0" },
  rejected: { label: "Rejected", color: "#B23A32", bg: "#FAE4E2" },
  approved: { label: "Approved", color: "#2A62B0", bg: "#E4EDFA" },
  technical_review: { label: "Technical Review", color: "#6D28D9", bg: "#EDE7FC" },
  awaiting_parts: { label: "Awaiting Parts", color: "#5B4FB0", bg: "#EAE7FA" },
  parts_arrived: { label: "Parts Arrived", color: "#1D7466", bg: "#E1F2EE" },
  parts_return: { label: "Parts Return", color: "#A84917", bg: "#FDEBE0" },
  repair_returned: { label: "After Repair Returned", color: "#A84917", bg: "#FDEBE0" },
  repair_submitted: { label: "After Repair Submitted", color: "#0E7490", bg: "#E0F2FE" },
  closed: { label: "Closed", color: "#2C7743", bg: "#E5F3E8" },
};
