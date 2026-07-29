"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

const items = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/tasks", label: "Aufgaben", icon: TaskIcon },
  { href: "/scoreboard", label: "Punkte", icon: TrophyIcon },
];

export function MainNavigation() {
  const pathname = usePathname();
  const { state, loginWithPin } = useAuth();
  const { play, playPinKey } = useSound();
  const [loginOpen, setLoginOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const currentMember = state.kind === "authenticated" ? state.me.member : null;

  async function login(pinValue: string) {
    if (pinValue.length !== 6 || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await loginWithPin(pinValue);
      play("success");
      setLoginOpen(false);
      setPin("");
    } catch {
      play("error");
      setPin("");
      setError("Diese PIN ist nicht bekannt. Bitte versuche es noch einmal.");
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  function updatePin(nextPin: string) {
    if (nextPin.length > pin.length) playPinKey(nextPin.at(-1) ?? "");
    setPin(nextPin);
    setError(null);
    if (nextPin.length === 6) void login(nextPin);
  }

  return <><nav aria-label="Hauptnavigation" className="flex w-full items-start justify-center gap-2 px-3 py-3 sm:gap-4">
    {items.map(({ href, label, icon: Icon }) => <NavItem key={href} href={href} label={label} active={pathname === href}><Icon /></NavItem>)}
    {currentMember ? <NavItem href="/profile" label="Profil" active={pathname === "/profile"}><ProfileIcon /></NavItem> : <NavButton label="Anmelden" onClick={() => { setError(null); setPin(""); setLoginOpen(true); }}><ProfileIcon /></NavButton>}
  </nav>{loginOpen && <PinLoginModal pin={pin} pending={pending} error={error} onClose={() => !pending && setLoginOpen(false)} onPinChange={updatePin} />}</>;
}

function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-label={label} title={label} className="group flex w-14 shrink-0 flex-col items-center gap-1 text-[11px] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2" style={{ color: active ? "var(--color-primary)" : "var(--color-foreground)" }}><span className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all group-hover:-translate-y-0.5" style={{ borderColor: active ? "var(--color-primary)" : "var(--color-border)", backgroundColor: active ? "var(--color-primary)" : "var(--color-button-surface)", color: active ? "var(--color-on-primary)" : "inherit" }}>{children}</span><span>{label}</span></Link>;
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="group flex w-14 shrink-0 flex-col items-center gap-1 text-[11px] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2" style={{ color: "var(--color-foreground)" }}><span className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all group-hover:-translate-y-0.5" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-button-surface)" }}>{children}</span><span>{label}</span></button>;
}

function PinLoginModal({ pin, pending, error, onClose, onPinChange }: { pin: string; pending: boolean; error: string | null; onClose: () => void; onPinChange: (pin: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const addDigit = (digit: string) => {
    if (!pending && pin.length < 6) onPinChange(`${pin}${digit}`);
  };
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="pin-login-title" className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>GC-Family</p><h2 id="pin-login-title" className="mt-1 text-3xl font-bold">Anmelden</h2></div><button type="button" onClick={onClose} disabled={pending} className="h-11 w-11 rounded-xl border text-xl font-bold" style={{ borderColor: "var(--color-border)" }} aria-label="Login schließen">×</button></div><p className="mt-2 text-sm" style={{ opacity: 0.72 }}>Gib deine sechsstellige PIN ein.</p><input autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(event) => onPinChange(event.target.value.replace(/\D/g, ""))} placeholder="••••••" className="mt-5 w-full rounded-xl border px-4 py-3 text-center text-3xl tracking-[0.38em] focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)" }} aria-label="Deine PIN" /><div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Nummernfeld für die PIN">{keys.map((key) => <button key={key} type="button" onClick={() => addDigit(key)} disabled={pending} className="h-11 rounded-xl border text-lg font-bold" style={{ borderColor: "var(--color-border)" }}>{key}</button>)}<button type="button" onClick={() => onPinChange("")} disabled={pending || pin.length === 0} className="h-11 rounded-xl border text-sm font-bold" style={{ borderColor: "var(--color-border)" }}>C</button><button type="button" onClick={() => addDigit("0")} disabled={pending} className="h-11 rounded-xl border text-lg font-bold" style={{ borderColor: "var(--color-border)" }}>0</button><button type="button" onClick={() => onPinChange(pin.slice(0, -1))} disabled={pending || pin.length === 0} className="h-11 rounded-xl border text-lg font-bold" style={{ borderColor: "var(--color-border)" }} aria-label="Letzte Ziffer löschen">⌫</button></div>{error && <p className="mt-4 rounded-xl px-3 py-2 text-sm font-semibold" style={{ color: "var(--color-destructive)", backgroundColor: "color-mix(in srgb, var(--color-destructive) 12%, transparent)" }}>{error}</p>}</section></div>, document.body);
}

function HomeIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>; }
function TaskIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 7.5M13.5 10h2.5M8 15l1.5 1.5 2.5-3M13.5 16h2.5" /></svg>; }
function TrophyIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6" /></svg>; }
function ProfileIcon() { return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>; }
