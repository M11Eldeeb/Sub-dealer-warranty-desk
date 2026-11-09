import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Never import this file from a "use client" component —
// SUPABASE_SERVICE_ROLE_KEY has full admin access and bypasses all RLS.
// It is deliberately NOT prefixed with NEXT_PUBLIC_, so Next.js will
// never ship it to the browser bundle as long as this stays server-side.
//
// Every request is sent with cache: "no-store". Next.js keeps the answer of an identical GET request (same URL) in its
// data cache and would otherwise hand the old answer back on later runs: the daily reminders job then worked from an
// old copy of the claims and e-mailed about parts that had already been supplied.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
  });
}
