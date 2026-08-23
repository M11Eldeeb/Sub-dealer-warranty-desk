import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/complete-profile");
  if (profile.role === "dealer") redirect("/dashboard/dealer");
  if (profile.role === "parts_team") redirect("/dashboard/parts-team");
  if (profile.role === "technical_team") redirect("/dashboard/technical-team");
  redirect("/dashboard/sub-dealer");
}
