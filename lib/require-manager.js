import { createClient } from "@/lib/supabase/server";

/** For user-management routes: the signed-in dealer / admin, or { error, status }. */
export async function requireManager() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", status: 401 };
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["dealer", "admin"].includes(profile?.role)) return { error: "Only dealer or admin accounts can manage users.", status: 403 };
  return { user, role: profile.role };
}

/** A dealer may not change an admin's account; an admin may change anyone's. */
export function canManage(actorRole, targetRole) {
  return actorRole === "admin" || targetRole !== "admin";
}
