"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/Sidebar";
import { HeaderMenu } from "@/components/ui";

const NO_RAIL = ["/login", "/complete-profile"];

/**
 * The desktop navigation rail, mounted once in the root layout so it is never rebuilt when a page changes: it stays on screen
 * while the next page loads and its white marker glides between buttons. (The pages themselves only draw their own content.)
 * It reads who is signed in by itself; on the login pages there is no rail.
 */
export default function AppRail() {
  const path = usePathname() || "";
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const hidden = NO_RAIL.some((p) => path === p || path.startsWith(`${p}/`));

  // the page makes room for the rail from the very first paint (see .has-sidebar in globals.css)
  useEffect(() => {
    document.body.classList.toggle("has-sidebar", !hidden);
    return () => document.body.classList.remove("has-sidebar");
  }, [hidden]);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return alive && setProfile(null);
      const { data: prof } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).single();
      if (alive && prof) setProfile(prof);
    };
    if (!hidden) load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setProfile(null);
      if (event === "SIGNED_IN") load();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [hidden]);

  const signOut = async () => {
    await createClient().auth.signOut();
    setProfile(null);
    router.push("/login");
  };

  if (hidden) return null;
  if (!profile) {
    // while the person is being read: the empty rail, so the page does not shift when it appears
    return (
      <nav aria-hidden="true" className="rail hidden lg:flex">
        <div className="rail-logo">
          <img src="/mg-logo.png" alt="" width="30" height="30" draggable="false" />
        </div>
      </nav>
    );
  }
  return <Sidebar profile={profile} menu={<HeaderMenu profile={profile} onSignOut={signOut} rail />} />;
}
