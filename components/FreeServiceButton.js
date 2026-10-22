"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

/** Toolbar button to the Free Service area. Hidden for sub-dealers until Free Service is opened to them. */
export default function FreeServiceButton() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    fetch("/api/free-service/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);
  if (!status?.canUse) return null;
  return (
    <Link
      href="/dashboard/free-service"
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors shrink-0"
    >
      <BadgeCheck size={14} className="text-[#E4002B]" /> Free Service
      {status.pending > 0 && <span className="bg-[#E4002B] text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[10px]">{status.pending}</span>}
    </Link>
  );
}
