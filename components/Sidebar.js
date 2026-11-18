"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, ClipboardList, PackageOpen, BadgeCheck, Receipt, Wallet, Users, Settings, Wrench, Package, Stethoscope } from "lucide-react";
import { useFreeService } from "@/lib/use-free-service";
import RevenueDialog from "@/components/RevenueDialog";

// Each page draws its own rail, so the rail starts afresh on every click. To still show the white marker travelling from the
// button you left to the one you pressed, the last active button is remembered here (this module stays loaded between pages).
let lastActiveKey = null;
const ROW_STEP = 50; // a button (44px) plus the gap between buttons (6px)

/**
 * The desktop navigation: a black rounded rail on the left with an icon for each place, a label that slides out on hover,
 * and a red dot where something waits for you. Phones and tablets keep the top bar with its menu (and the bottom tabs).
 * `menu` is the account button shown at the bottom of the rail (the menu with export, appearance and sign out).
 */
export default function Sidebar({ profile, menu }) {
  const path = usePathname() || "";
  const role = profile?.role;
  const freeService = useFreeService(role, profile?.id);
  const actions = freeService?.actions || { claims: 0, free: 0, defects: 0 };
  const [revenueOpen, setRevenueOpen] = useState(false);

  // Page content makes room for the rail (see .has-sidebar in globals.css).
  useEffect(() => {
    document.body.classList.add("has-sidebar");
    return () => document.body.classList.remove("has-sidebar");
  }, []);

  const staff = role === "dealer" || role === "admin";
  const viewer = role === "manager";
  const on = (...prefixes) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

  const top = [];
  if (staff || viewer) {
    top.push({ key: "home", href: "/dashboard", label: "Home", Icon: LayoutDashboard, active: path === "/dashboard" });
    top.push({ key: "claims", href: "/dashboard/dealer", label: "Warranty claims", Icon: ClipboardList, active: on("/dashboard/dealer", "/claims"), dot: actions.claims > 0 });
  } else if (role === "sub_dealer") {
    top.push({ key: "claims", href: "/dashboard/sub-dealer", label: "Warranty claims", Icon: ClipboardList, active: on("/dashboard/sub-dealer", "/claims"), dot: actions.claims > 0 });
  } else if (role === "parts_team") {
    top.push({ key: "parts", href: "/dashboard/parts-team", label: "Parts", Icon: Package, active: on("/dashboard/parts-team", "/claims") });
  } else if (role === "technical_team") {
    top.push({ key: "tech", href: "/dashboard/technical-team", label: "Technical review", Icon: Stethoscope, active: on("/dashboard/technical-team", "/claims") });
  }
  if (staff || viewer || role === "sub_dealer") {
    top.push({ key: "defects", href: "/dashboard/defect-returns", label: "Defected parts", Icon: PackageOpen, active: on("/dashboard/defect-returns", "/defect-returns"), dot: actions.defects > 0 });
  }
  if ((staff || viewer || role === "sub_dealer") && freeService?.canUse) {
    top.push({ key: "free", href: "/dashboard/free-service", label: "Free Service", Icon: BadgeCheck, active: on("/dashboard/free-service", "/free-service"), dot: actions.free > 0 });
  }
  if (staff) top.push({ key: "bill", href: "/dashboard/billing", label: "Sub-dealer bill", Icon: Receipt, active: on("/dashboard/billing") });
  if (staff || viewer) top.push({ key: "revenue", label: "Revenue", Icon: Wallet, onClick: () => setRevenueOpen(true) });

  const bottom = [];
  if (staff) {
    bottom.push({ key: "users", href: "/dashboard/users", label: "User settings", Icon: Users, active: on("/dashboard/users") });
    bottom.push({ key: "settings", href: "/dashboard/settings", label: "Settings", Icon: Settings, active: on("/dashboard/settings") });
  }

  // where the marker was on the previous page, in rows above (-) or below (+) the button that is active now
  const activeKey = [...top, ...bottom].find((i) => i.active)?.key ?? null;
  const prevIndex = top.findIndex((i) => i.key === lastActiveKey);
  useEffect(() => {
    if (activeKey) lastActiveKey = activeKey;
  }, [activeKey]);

  return (
    <>
      <nav aria-label="Main" className="rail hidden lg:flex" style={{ boxShadow: "0 18px 40px -16px rgba(0,0,0,0.45)" }}>
        <Link href="/" title="Home" className="rail-logo no-press" aria-label="WarrantyDesk home">
          <Wrench size={18} className="text-white" />
        </Link>
        <ul className="flex flex-col items-center gap-1.5 mt-5">
          {top.map((item, i) => (
            <RailItem key={item.key} item={item} slideFrom={item.active && prevIndex >= 0 && prevIndex !== i ? (prevIndex - i) * ROW_STEP : 0} />
          ))}
        </ul>
        <ul className="flex flex-col items-center gap-1.5 mt-auto">
          {bottom.map((item) => (
            <RailItem key={item.key} item={item} />
          ))}
          <li className="mt-1">{menu}</li>
        </ul>
      </nav>
      {revenueOpen && <RevenueDialog onClose={() => setRevenueOpen(false)} />}
    </>
  );
}

function RailItem({ item, slideFrom = 0 }) {
  const { href, label, Icon, active, dot, onClick } = item;
  const cls = `rail-item no-press ${active ? "rail-item-active" : ""}`;
  const inner = (
    <>
      {active && (
        // the white marker: it slides in from the button the person came from
        <motion.span
          aria-hidden="true"
          className="rail-pill"
          initial={slideFrom ? { y: slideFrom } : false}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 460, damping: 36, mass: 0.9 }}
        />
      )}
      <Icon size={19} strokeWidth={active ? 2.4 : 2} aria-hidden="true" className="relative z-10" />
      {dot && <span aria-hidden="true" className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#E4002B] border-2 border-[#111111]" />}
      <span className="rail-tip" role="tooltip">
        {label}
      </span>
      <span className="sr-only">{label}{dot ? " (needs your action)" : ""}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} aria-current={active ? "page" : undefined} className={cls}>
          {inner}
        </Link>
      ) : (
        <button onClick={onClick} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}
