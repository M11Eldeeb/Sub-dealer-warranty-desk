"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wrench } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState("login"); // login | signup
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupMessage, setSignupMessage] = useState("");

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

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSignupMessage("");

    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);

    if (data.session) {
      // Email confirmation is off for this project — go straight to profile setup.
      router.push("/complete-profile");
      router.refresh();
      return;
    }

    setSignupMessage("Account created! Check your email for a confirmation link, then log in below.");
    setMode("login");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
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
          <div className="flex mb-5 bg-[#F1F2F4] rounded-lg p-1 text-sm">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-1.5 rounded-md font-bold ${mode === "login" ? "bg-white shadow-sm" : "text-[#6E6E6E]"}`}
            >
              Log in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-md font-bold ${mode === "signup" ? "bg-white shadow-sm" : "text-[#6E6E6E]"}`}
            >
              Create account
            </button>
          </div>

          {signupMessage && (
            <div className="text-xs text-[#1E7A6B] bg-[#E1F2EE] border border-[#C3E5DD] rounded p-2.5 mb-3">{signupMessage}</div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-3">
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
              {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="text-xs text-[#6E6E6E] mt-3">
              After this, you'll pick your role (Dealer or Sub-Dealer) and branch on the next screen.
            </p>
          )}
        </div>

        <p className="text-xs text-white/70 text-center mt-4">
          For a real launch, restrict who can sign up as Dealer — see the README.
        </p>
      </div>
    </div>
  );
}
