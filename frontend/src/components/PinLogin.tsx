"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

export function PinLogin() {
  const { loginWithPin } = useAuth();
  const { play, playPinKey } = useSound();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function login(value: string) {
    if (value.length !== 6 || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await loginWithPin(value);
      play("success");
    } catch (caught) {
      setPin("");
      setError(caught instanceof ApiError && caught.status === 401 ? "Diese PIN ist nicht bekannt." : "Anmelden hat gerade nicht geklappt. Bitte erneut versuchen.");
      play("error");
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  function updatePin(value: string) {
    if (submitting.current) return;
    const next = value.replace(/\D/g, "").slice(0, 6);
    if (next.length > pin.length) playPinKey(next.at(-1) ?? "");
    setPin(next);
    setError(null);
    if (next.length === 6) void login(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void login(pin);
  }

  return <form onSubmit={submit} className="mb-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Wer hilft heute mit?</h2><p className="text-sm" style={{ color: "var(--color-subtle-text)" }}>Mit deiner sechsstelligen PIN geht’s los.</p></div>
      <div className="flex w-full gap-2 sm:w-auto">
        <input id="family-pin" aria-label="Deine PIN" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} disabled={pending} onChange={(event) => updatePin(event.target.value)} className="input min-w-0 flex-1 text-center tracking-[0.3em] sm:max-w-48" placeholder="••••••" />
        <button type="submit" disabled={pending || pin.length !== 6} className="button-primary">{pending ? "Prüfe…" : "Anmelden"}</button>
      </div>
    </div>
    <details className="mt-2 max-w-xs"><summary className="flex cursor-pointer items-center text-xs font-semibold" style={{ color: "var(--color-primary)" }}>Nummernfeld öffnen</summary><div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => <button key={key} type="button" disabled={pending} aria-label={key === "C" ? "PIN löschen" : key === "⌫" ? "Letzte Ziffer löschen" : key} className="button-secondary" onClick={() => updatePin(key === "C" ? "" : key === "⌫" ? pin.slice(0, -1) : pin + key)}>{key}</button>)}
    </div></details>
    {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-destructive)" }}>{error}</p>}
  </form>;
}
