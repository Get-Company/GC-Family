"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TaskCard } from "@/components/TaskCard";
import {
  completeInstance,
  getMembers,
  getStats,
  getTodayInstances,
  type Instance,
  type Member,
  type Stats,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export default function Dashboard() {
  const router = useRouter();
  const { state: authState, logout } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { play, muted, toggleMuted } = useSound();

  useEffect(() => {
    if (authState.kind === "anonymous") {
      router.replace("/login");
      return;
    }
    if (authState.kind !== "authenticated") {
      return;
    }
    Promise.all([getMembers(), getTodayInstances(), getStats()])
      .then(([m, i, nextStats]) => {
        setMembers(m);
        setInstances(i);
        setStats(nextStats);
      })
      .catch(() => {
        setError(true);
        play("error");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.kind, router]);

  const visible = useMemo(
    () =>
      filter === null
        ? instances
        : instances.filter((i) => i.assigned_member_id === filter),
    [instances, filter],
  );

  const doneCount = visible.filter((i) => i.status === "DONE").length;
  const progress = visible.length ? (doneCount / visible.length) * 100 : 0;

  async function handleComplete(id: number) {
    const target = instances.find((i) => i.id === id);
    // Optimistisch aktualisieren + Sound.
    setInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "DONE" } : i)),
    );
    play("success");
    try {
      await completeInstance(id, target?.assigned_member_id ?? null);
      setStats(await getStats());
    } catch {
      play("error");
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "OPEN" } : i)),
      );
    }
  }

  const today = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (authState.kind !== "authenticated") {
    return <main className="flex flex-1 items-center justify-center">Lädt…</main>;
  }

  const currentMember = authState.me.member;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      {/* Kopfbereich */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="mb-6 flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Heute</h1>
          <p className="text-sm capitalize" style={{ opacity: 0.7 }}>
            {today}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/login")}
            aria-label="Profil wechseln"
            className="cursor-pointer rounded-full border px-3 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"
            style={{
              borderColor: "var(--color-border)",
              ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties),
            }}
          >
            {currentMember.emoji} {currentMember.display_name}
          </button>
          {currentMember.role === "PARENT" && (
            <Link
              href="/manage"
              className="cursor-pointer rounded-full border px-3 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              Verwalten
            </Link>
          )}
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? "Ton einschalten" : "Ton ausschalten"}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2"
            style={{
              borderColor: "var(--color-border)",
              ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties),
            }}
          >
            {muted ? <SpeakerOff /> : <SpeakerOn />}
          </button>
          <button
            type="button"
            onClick={logout}
            aria-label="Abmelden"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"
            style={{ borderColor: "var(--color-border)" }}
          >
            <LogOut />
          </button>
        </div>
      </motion.header>

      {/* Fortschrittsbalken */}
      <div
        className="mb-6 h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--color-muted)" }}
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: "var(--color-secondary)" }}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-sm font-bold" style={{ opacity: 0.7 }}>Punkte heute</p>
          <p className="text-3xl font-bold" style={{ color: "var(--color-secondary)" }}>{stats?.points_today ?? 0}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-sm font-bold" style={{ opacity: 0.7 }}>Tage am Stück</p>
          <p className="text-3xl font-bold" style={{ color: "var(--color-accent)" }}>{stats?.current_streak ?? 0}</p>
        </div>
      </div>

      {/* Mitglieder-Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip
          active={filter === null}
          label="Alle"
          onClick={() => {
            setFilter(null);
            play("click");
          }}
        />
        {members.map((m) => (
          <FilterChip
            key={m.id}
            active={filter === m.id}
            label={`${m.emoji} ${m.display_name}`}
            color={m.color}
            onClick={() => {
              setFilter(m.id);
              play("click");
            }}
          />
        ))}
      </div>

      {/* Aufgabenliste */}
      {loading ? (
        <p style={{ opacity: 0.6 }}>Lädt…</p>
      ) : error ? (
        <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--color-destructive)" }}>
          <p className="font-bold">Aufgaben konnten nicht geladen werden.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 cursor-pointer rounded-xl px-4 py-2 font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>Erneut versuchen</button>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.ul
          className="flex flex-col gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.06 } },
          }}
        >
          <AnimatePresence>
            {visible.map((instance) => (
              <TaskCard
                key={instance.id}
                instance={instance}
                onComplete={handleComplete}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </main>
  );
}

function FilterChip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
      style={{
        borderColor: active ? color ?? "var(--color-primary)" : "var(--color-border)",
        backgroundColor: active ? `${color ?? "#2563eb"}1a` : "transparent",
        color: active ? color ?? "var(--color-primary)" : "var(--color-foreground)",
        ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties),
      }}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="rounded-2xl border border-dashed py-16 text-center"
      style={{ borderColor: "var(--color-border)" }}
    >
      <p className="text-4xl" aria-hidden>
        🎉
      </p>
      <p className="mt-2 text-lg font-semibold">Alles erledigt!</p>
      <p className="text-sm" style={{ opacity: 0.7 }}>
        Für diese Auswahl gibt es heute nichts mehr zu tun.
      </p>
    </motion.div>
  );
}

function SpeakerOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}

function LogOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-7" />
    </svg>
  );
}
