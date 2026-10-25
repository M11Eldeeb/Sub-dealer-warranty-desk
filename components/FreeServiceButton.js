"use client";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useFreeService } from "@/lib/use-free-service";

/** Toolbar button to the Free Service area. Hidden for sub-dealers until Free Service is opened to them. */
export default function FreeServiceButton({ role, userId }) {
  const status = useFreeService(role, userId);
  if (!status?.canUse) return null;
  return (
    <Link
      href="/dashboard/free-service"
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide text-[#111111] bg-white border border-[#E0E0E0] hover:border-[#111111] transition-colors shrink-0"
    >
      <BadgeCheck size={14} className="text-[#E4002B]" /> Free Service
      {status.pending > 0 && <span className="fade-in bg-[#E4002B] text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[11px]">{status.pending}</span>}
    </Link>
  );
}
