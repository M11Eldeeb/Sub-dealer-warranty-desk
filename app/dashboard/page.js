"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/lib/use-page-title";
import { createClient } from "@/lib/supabase/client";
import { LoadingShell, Header } from "@/components/ui";
import HomeDashboard from "@/components/HomeDashboard";

/** The home page of the dealer, admin and manager: the sub-dealer analytics at a glance. */
export default function HomePage() {
  usePageTitle("Home");
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof) return router.push("/login?setup=1");
      // the other roles have their own first page
      if (prof.role === "sub_dealer") return router.push("/dashboard/sub-dealer");
      if (prof.role === "parts_team") return router.push("/dashboard/parts-team");
      if (prof.role === "technical_team") return router.push("/dashboard/technical-team");
      setProfile(prof);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!profile) return <LoadingShell cards={4} />;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <Header profile={profile} onSignOut={signOut} />
      <main role="main">
        <HomeDashboard profile={profile} />
      </main>
    </div>
  );
}
