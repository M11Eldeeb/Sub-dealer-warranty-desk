import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Never import this file from a "use client" component —
// SUPABASE_SERVICE_ROLE_KEY has full admin access and bypasses all RLS.
// It is deliberately NOT prefixed with NEXT_PUBLIC_, so Next.js will
// never ship it to the browser bundle as long as this stays server-side.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
