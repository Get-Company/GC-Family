"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/AuthProvider";

const items = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/tasks", label: "Aufgaben", icon: TaskIcon },
  { href: "/scoreboard", label: "Punkte", icon: TrophyIcon },
];

export function MainNavigation() {
  const pathname = usePathname();
  const { state } = useAuth();
  const currentMember = state.kind === "authenticated" ? state.me.member : null;
  return <nav aria-label="Hauptnavigation" className="flex min-w-0 items-center justify-center gap-1 overflow-x-auto px-1 py-2">
    {items.map(({ href, label, icon: Icon }) => <NavItem key={href} href={href} label={label} active={pathname === href}><Icon /></NavItem>)}
    <NavItem href={currentMember ? "/profile" : "/login"} label={currentMember ? "Profil" : "Anmelden"} active={pathname === "/profile" || pathname === "/login"}><ProfileIcon /></NavItem>
  </nav>;
}

function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-label={label} title={label} className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-[8px] font-bold leading-none tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: active ? "var(--color-primary)" : "var(--color-border)", color: active ? "var(--color-primary)" : "var(--color-foreground)", backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 14%, var(--color-background))" : "var(--color-button-surface)" }}><span className="mb-0.5">{children}</span><span>{label}</span></Link>;
}

function HomeIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>; }
function TaskIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 7.5M13.5 10h2.5M8 15l1.5 1.5 2.5-3M13.5 16h2.5" /></svg>; }
function TrophyIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6" /></svg>; }
function ProfileIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>; }
