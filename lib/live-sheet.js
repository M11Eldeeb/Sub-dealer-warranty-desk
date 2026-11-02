// SERVER-ONLY. Keeps one Google Sheet in step with the portal: every claim and Free Service request, refreshed on a
// schedule (and on demand). The sheet lives in the connected Google account's Drive; dealer, admin and manager
// accounts are given view access. The same file is updated each time, so its link never changes.
import * as XLSX from "xlsx";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLAIMS_SELECT, FREE_SERVICE_SELECT, buildWorkbook } from "@/lib/export-rows";
import { createSheetFromXlsx, getDriveStatus, replaceSheetFromXlsx, shareFileWithViewers } from "@/lib/google-drive";

const SETTING_KEY = "live_sheet";
const SHEET_NAME = "Warranty Desk - Live Data";
export const REFRESH_MINUTES = 15;

/** Every row (the database hands back 1000 at a time). */
async function fetchAll(admin, kind, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("claims").select(select).eq("kind", kind).order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function getLiveSheet() {
  noStore(); // always the newest row: Next would otherwise keep serving the first answer it saw
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", SETTING_KEY).maybeSingle();
  return data?.value?.id ? data.value : null;
}

async function viewerEmails(admin) {
  const { data: profiles } = await admin.from("profiles").select("id").in("role", ["admin", "dealer", "manager"]);
  const ids = new Set((profiles || []).map((p) => p.id));
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return (data?.users || []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email);
}

/**
 * Rebuilds the sheet from the database. `share` also (re)grants view access to the dealer, admin and manager accounts -
 * done when the sheet is created and when someone asks for a refresh by hand, not on every scheduled run.
 */
export async function syncLiveSheet({ share = false } = {}) {
  noStore();
  const drive = await getDriveStatus();
  if (!drive) return { skipped: "not-connected" };

  const admin = createAdminClient();
  const [claims, freeService] = await Promise.all([fetchAll(admin, "claim", CLAIMS_SELECT), fetchAll(admin, "free_service", FREE_SERVICE_SELECT)]);

  const workbook = buildWorkbook(XLSX, { claims, freeService });
  const updatedAt = new Date().toISOString();
  const about = XLSX.utils.aoa_to_sheet([
    ["Warranty Desk - live data"],
    [],
    ["Last updated", new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt)) + " (Saudi time)"],
    ["Refreshes", `About every ${REFRESH_MINUTES} minutes, automatically`],
    ["Claims", claims.length],
    ["Free Service requests", freeService.length],
    [],
    ["This sheet is a read-only copy of the portal. Change data in the portal, never here: edits here are overwritten at the next refresh."],
  ]);
  about["!cols"] = [{ wch: 24 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, about, "About");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const known = await getLiveSheet();
  let id = known?.id;
  let created = false;
  if (!id || !(await replaceSheetFromXlsx(id, bytes))) {
    id = await createSheetFromXlsx({ name: SHEET_NAME, bytes });
    created = true;
  }

  let notShared = [];
  if (share || created) {
    const mine = (drive.accountEmail || "").toLowerCase();
    notShared = await shareFileWithViewers(id, (await viewerEmails(admin)).filter((e) => e.toLowerCase() !== mine));
  }

  const value = { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, updated_at: updatedAt, owner: drive.accountEmail, claims: claims.length, free_service: freeService.length };
  await admin.from("app_settings").upsert({ key: SETTING_KEY, value, updated_at: updatedAt });
  return { ...value, created, notShared };
}
