"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export default function LoginPage() {
  const router = useRouter();
  const { state, loginParent, unlockChild, switchToParent } = useAuth();
  const { play } = useSound();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedChild =
    state.kind === "authenticated"
      ? state.deviceMembers.find((member) => member.id === selectedMemberId)
      : undefined;

  async function submitParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await loginParent(email, password);
      play("success");
    } catch (caught) {
      play("error");
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
  }

  async function submitPin() {
    if (selectedMemberId === null || pin.length !== 4) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await unlockChild(selectedMemberId, pin);
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
    const parent = state.deviceMembers.find((member) => member.role === "PARENT");
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="rounded-3xl border p-6 sm:p-8"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}
        >
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Familiengerät
          </p>
          <h1 className="mt-1 text-4xl font-bold">Wer ist heute dran?</h1>
          <p className="mt-2" style={{ opacity: 0.72 }}>
            Wähle dein Profil aus. Kinder entsperren es mit ihrer PIN.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {state.deviceMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  setSelectedMemberId(member.id);
                  setPin("");
                  setError(null);
                  play("click");
                }}
                className="cursor-pointer rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                style={{
                  borderColor:
                    selectedMemberId === member.id ? member.color : "var(--color-border)",
                  backgroundColor:
                    selectedMemberId === member.id ? `${member.color}14` : "transparent",
                  ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties),
                }}
              >
                <span className="block text-3xl" aria-hidden>{member.emoji}</span>
                <span className="mt-2 block font-bold">{member.display_name}</span>
                <span className="text-sm" style={{ opacity: 0.7 }}>
                  {member.role === "PARENT" ? "Elternteil" : "Kind"}
                </span>
              </button>
            ))}
          </div>

          {selectedChild?.role === "CHILD" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="mt-6"
            >
              <p className="text-center font-bold">PIN für {selectedChild.display_name}</p>
              <div className="mt-3 flex justify-center gap-3" aria-label="Eingegebene PIN">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: index < pin.length ? "var(--color-primary)" : "var(--color-border)" }}
                  />
                ))}
              </div>
              <div className="mx-auto mt-5 grid max-w-64 grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => {
                      if (pin.length < 4) {
                        setPin((current) => `${current}${digit}`);
                        play("click");
                      }
                    }}
                    className="h-12 cursor-pointer rounded-xl border text-lg font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"
                    style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }}
                    aria-label={`Ziffer ${digit}`}
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin((current) => current.slice(0, -1))}
                  className="h-12 cursor-pointer rounded-xl border text-sm font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"
                  style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }}
                  aria-label="Letzte Ziffer löschen"
                >
                  Löschen
                </button>
              </div>
              <button
                type="button"
                disabled={pin.length !== 4 || pending}
                onClick={() => void submitPin()}
                className="mt-5 w-full cursor-pointer rounded-xl px-4 py-3 font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {pending ? "Prüfe PIN…" : "Profil öffnen"}
              </button>
            </motion.div>
          )}

          {selectedChild?.role === "PARENT" && (
            <button
              type="button"
              onClick={() => void switchToParent().then(() => router.replace("/"))}
              className="mt-6 w-full cursor-pointer rounded-xl px-4 py-3 font-bold text-white transition-opacity"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Als {selectedChild.display_name} fortfahren
            </button>
          )}
          {!selectedChild && parent && (
            <button
              type="button"
              onClick={() => void switchToParent().then(() => router.replace("/"))}
              className="mt-6 w-full cursor-pointer rounded-xl px-4 py-3 font-bold text-white transition-opacity"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Als {parent.display_name} fortfahren
            </button>
          )}
          {error && <p className="mt-4 text-sm font-semibold" style={{ color: "var(--color-destructive)" }}>{error}</p>}
        </motion.section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        onSubmit={submitParent}
        className="rounded-3xl border p-6 sm:p-8"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}
      >
        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>GC-Family</p>
        <h1 className="mt-1 text-4xl font-bold">Willkommen zurück</h1>
        <p className="mt-2" style={{ opacity: 0.72 }}>Melde zuerst ein Elternkonto an diesem Gerät an.</p>
        <label htmlFor="email" className="mt-6 block text-sm font-bold">E-Mail-Adresse</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }} />
        <label htmlFor="password" className="mt-4 block text-sm font-bold">Passwort</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)", ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties) }} />
        {error && <p className="mt-4 text-sm font-semibold" style={{ color: "var(--color-destructive)" }}>{error}</p>}
        <button type="submit" disabled={pending} className="mt-6 w-full cursor-pointer rounded-xl px-4 py-3 font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: "var(--color-accent)" }}>
          {pending ? "Melde an…" : "Anmelden"}
        </button>
      </motion.form>
    </main>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Die Zugangsdaten oder PIN sind nicht korrekt.";
  }
  return "Das hat gerade nicht geklappt. Bitte versuche es erneut.";
}
