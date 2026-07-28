"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export default function LoginPage() {
  const router = useRouter();
  const { state, loginWithPin } = useAuth();
  const { play } = useSound();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.kind === "authenticated") router.replace("/");
  }, [router, state.kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      await loginWithPin(pin);
      play("success");
      router.replace("/");
    } catch (caught) {
      play("error");
      setPin("");
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
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
        <input id="family-pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••••" className="mt-2 w-full rounded-xl border px-4 py-4 text-center text-3xl tracking-[0.38em] focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }} />
        <p className="mt-2 text-sm" style={{ opacity: 0.7 }}>Für Kinder und Eltern gleich.</p>
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
