"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wrench } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
        <source src="/mg-login-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded bg-[#E4002B] flex items-center justify-center">
            <Wrench size={18} className="text-white" />
          </div>
          <div className="font-black uppercase tracking-wide text-white">WarrantyDesk</div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-lg p-6 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <div className="text-xs text-[#B23A32]">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md font-bold text-sm uppercase tracking-wide text-white bg-[#E4002B] hover:bg-[#B8001F] disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Log in"}
            </button>
          </form>
        </div>

        <p className="text-xs text-white/70 text-center mt-4">
          Don't have an account? Ask your dealer to create one for you.
        </p>
      </div>
    </div>
  );
}
