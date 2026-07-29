"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LoginPage() {
  const router = useRouter();
  const { state, loginWithPin } = useAuth();
  const { play } = useSound();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (state.kind === "authenticated") router.replace("/");
  }, [router, state.kind]);

  async function login(pinValue: string) {
    if (pinValue.length !== 6 || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await loginWithPin(pinValue);
      play("success");
      router.replace("/");
    } catch (caught) {
      play("error");
      setPin("");
      setError(messageFor(caught));
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login(pin);
  }

  function updatePin(nextPin: string) {
    setPin(nextPin);
    setError(null);
    if (nextPin.length === 6) void login(nextPin);
  }

  function addDigit(digit: string) {
    if (pending || pin.length >= 6) return;
    updatePin(`${pin}${digit}`);
  }

  if (state.kind === "loading") {
    return <main className="flex flex-1 items-center justify-center">Lädt…</main>;
  }

  if (state.kind === "authenticated") {
    return <main className="flex flex-1 items-center justify-center">Weiter zum Dashboard…</main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        onSubmit={submit}
        className="rounded-3xl border p-6 sm:p-8"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}
      >
        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>GC-Family</p>
        <h1 className="mt-1 text-4xl font-bold">Willkommen</h1>
        <p className="mt-2" style={{ opacity: 0.72 }}>Gib deine persönliche sechsstellige PIN ein. Dein Profil wird automatisch erkannt.</p>
        <label htmlFor="family-pin" className="mt-6 block text-lg font-bold">Deine PIN</label>
        <input id="family-pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={(event) => updatePin(event.target.value.replace(/\D/g, ""))} placeholder="••••••" className="mt-2 w-full rounded-xl border px-4 py-4 text-center text-3xl tracking-[0.38em] focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }} />
        <p className="mt-2 text-sm" style={{ opacity: 0.7 }}>Für Kinder und Eltern gleich.</p>
        <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="Nummernfeld für die PIN">
          {KEYPAD_KEYS.map((digit) => (
            <button key={digit} type="button" onClick={() => addDigit(digit)} disabled={pending} className="rounded-xl border py-3 text-xl font-bold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--color-border)" }}>
              {digit}
            </button>
          ))}
          <button type="button" onClick={() => updatePin("")} disabled={pending || pin.length === 0} className="rounded-xl border py-3 text-sm font-bold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--color-border)" }} aria-label="PIN löschen">
            C
          </button>
          <button type="button" onClick={() => addDigit("0")} disabled={pending} className="rounded-xl border py-3 text-xl font-bold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--color-border)" }}>
            0
          </button>
          <button type="button" onClick={() => updatePin(pin.slice(0, -1))} disabled={pending || pin.length === 0} className="rounded-xl border py-3 text-xl font-bold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--color-border)" }} aria-label="Letzte PIN-Ziffer löschen">
            ⌫
          </button>
        </div>
        {error && <p className="mt-4 rounded-xl px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-destructive)", backgroundColor: "color-mix(in srgb, var(--color-destructive) 12%, transparent)" }}>{error}</p>}
        <button type="submit" disabled={pending || pin.length !== 6} className="mt-6 w-full cursor-pointer rounded-xl px-4 py-4 text-lg font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: "var(--color-accent)" }}>
          {pending ? "Prüfe PIN…" : "Anmelden"}
        </button>
      </motion.form>
    </main>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 422)) {
    return "Diese PIN ist nicht bekannt. Bitte versuche es noch einmal.";
  }
  return "Das hat gerade nicht geklappt. Bitte versuche es erneut.";
}
