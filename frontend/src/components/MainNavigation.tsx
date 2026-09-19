"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";

const items = [
  { href: "/", label: "Aufgaben", icon: TaskIcon },
  { href: "/scoreboard", label: "Scoreboard", icon: TrophyIcon },
];

export function MainNavigation() {
  const pathname = usePathname();
  const { state } = useAuth();
  const member = state.kind === "authenticated" ? state.me.member : null;
  const visibleItems = member?.role === "PARENT" ? [...items, { href: "/manage", label: "Verwalten", icon: ManageIcon }] : items;
  return <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:static md:mx-auto md:max-w-7xl md:justify-center md:border-t md:px-4 md:py-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}>
    <div className="flex w-full max-w-xl items-stretch justify-center gap-1 md:max-w-2xl md:gap-2">
      {visibleItems.map(({ href, label, icon: Icon }) => <NavItem key={href} href={href} label={label} active={pathname === href || href === "/" && pathname === "/tasks"}><Icon /></NavItem>)}
      <NavItem href={member ? "/profile" : "/#family-pin"} label={member ? "Profil" : "Anmelden"} active={pathname === "/profile"}><ProfileIcon /></NavItem>
    </div>
  </nav>;
}

function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} aria-label={label} className="relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold leading-none focus-visible:outline-none focus-visible:ring-2 md:flex-row md:gap-2 md:px-3 md:text-sm" style={{ color: active ? "var(--color-primary)" : "var(--color-subtle-text)", backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent" }}><span className="flex h-6 w-6 items-center justify-center">{children}</span><span className="truncate">{label}</span>{active && <span className="absolute bottom-0 h-0.5 w-8 rounded-full md:bottom-1" style={{ backgroundColor: "var(--color-primary)" }} />}</Link>;
}

function TaskIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 7.5M13.5 10h2.5M8 15l1.5 1.5 2.5-3M13.5 16h2.5" /></svg>; }
function TrophyIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6" /></svg>; }
function ManageIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="4" /></svg>; }
function ProfileIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>; }
