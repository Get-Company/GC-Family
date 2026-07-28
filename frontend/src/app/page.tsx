"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TaskCard } from "@/components/TaskCard";
import {
  completeInstance,
  getPublicDashboard,
  reopenInstance,
  uncompleteInstance,
  type Instance,
  type Member,
  type MemberWeeklyStats,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";
import { randomInspiration } from "@/lib/inspirations";

export default function Dashboard() {
  const { state: authState, logout } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [stats, setStats] = useState<MemberWeeklyStats[]>([]);
  const [filter, setFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "DONE">("ALL");
  const [error, setError] = useState<string | null>(null);
  const { play, playJingle } = useSound();

  const loadDashboard = useCallback(async () => {
    const dashboard = await getPublicDashboard();
    setMembers(dashboard.members);
    setInstances(dashboard.instances);
    setStats(dashboard.stats);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDashboard().catch(() => setError("Die Aufgaben konnten nicht geladen werden."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadDashboard]);

  const currentMember = authState.kind === "authenticated" ? authState.me.member : null;
  const activeChild = currentMember?.role === "CHILD" ? currentMember : null;
  const isParent = currentMember?.role === "PARENT";
  const canAccessBackend = authState.kind === "authenticated" && Boolean(authState.me.user?.can_access_backend);
  const visible = useMemo(() => {
    const activeFilter = activeChild?.id ?? filter;
    return instances.filter((instance) => {
      const memberMatches = activeFilter === null || instance.assigned_member_ids.includes(activeFilter);
      const statusMatches = statusFilter === "ALL" || (statusFilter === "DONE" ? instance.status === "DONE" : instance.status !== "DONE");
      return memberMatches && statusMatches;
    });
  }, [activeChild?.id, filter, instances, statusFilter]);
  const rankedStats = useMemo(() => stats.filter((stat) => stat.points > 0).sort((a, b) => b.points - a.points || b.completed_tasks - a.completed_tasks), [stats]);

  async function handleComplete(id: number, share = false) {
    if (!currentMember) {
      setError("Melde dich mit deinem Profil und deiner PIN an, bevor du eine Aufgabe übernimmst.");
      play("error");
      return;
    }
    setError(null);
    try {
      const instance = await completeInstance(id, currentMember.id, share);
      setInstances((current) => current.map((item) => item.id === id ? instance : item));
      await loadDashboard();
      playJingle(currentMember.completion_jingle);
    } catch {
      const task = instances.find((item) => item.id === id);
      const owners = task?.assigned_member_names?.join(" und ") || task?.assigned_member_name || "einem anderen Familienmitglied";
      setError(share ? `${currentMember.display_name}, dein halber Anteil konnte gerade nicht übernommen werden. Prüfe bitte, ob die Aufgabe noch offen ist.` : `${currentMember.display_name}, diese Aufgabe gehört ${owners}. Schön, dass du helfen möchtest – übernimm sie bitte gemeinsam oder frage kurz nach.`);
      play("error");
    }
  }

  async function handleReopen(id: number) {
    try {
      const instance = await reopenInstance(id);
      setInstances((current) => current.map((item) => item.id === id ? instance : item));
      await loadDashboard();
    } catch {
      setError("Die Aufgabe konnte nicht zurückgesetzt werden.");
    }
  }

  async function handleUndo(id: number) {
    try {
      const instance = await uncompleteInstance(id);
      setInstances((current) => current.map((item) => item.id === id ? instance : item));
      await loadDashboard();
      if (currentMember) {
        playJingle(currentMember.undo_jingle, "click");
      }
    } catch {
      setError("Dein Anteil konnte nicht zurückgenommen werden.");
      play("error");
    }
  }

  const { start, end } = currentWeekBounds();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>GC-Family</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Unsere Woche</h1>
          <p className="mt-1 text-lg font-bold" style={{ color: "var(--color-primary)" }}>Heute: {formatLongDate(new Date())}</p>
          <p className="mt-1 text-sm" style={{ opacity: 0.7 }}>{formatDate(start)} – {formatDate(end)} · neue Woche ab Sonntag, 00:00 Uhr</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isParent ? <><Link href="/history" className="button-secondary">Verlauf</Link><Link href="/manage" className="button-secondary">Verwalten</Link>{canAccessBackend && <Link href="/admin/" className="button-secondary">Backend</Link>}<button type="button" onClick={logout} className="button-secondary">Abmelden</button></> : activeChild ? <button type="button" onClick={logout} className="button-secondary">{activeChild.emoji} {activeChild.display_name} abmelden</button> : <Link href="/login" className="button-secondary">Eltern anmelden</Link>}
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <ProfilePanel activeMember={currentMember} />
        <Scoreboard stats={rankedStats} />
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Aufgaben</h2><p className="text-sm" style={{ opacity: 0.7 }}>Tagesaufgaben erst am jeweiligen Tag; Wochen- und Monatsaufgaben schon vorher.</p></div><div className="space-y-2"><div className="flex flex-wrap gap-2"><FilterChip active={filter === null} label="Alle Personen" onClick={() => setFilter(null)} />{members.map((member) => <FilterChip key={member.id} active={filter === member.id} label={`${member.emoji} ${member.display_name}`} color={member.color} onClick={() => setFilter(member.id)} />)}</div><div className="flex flex-wrap gap-2"><FilterChip active={statusFilter === "ALL"} label="Alle" onClick={() => setStatusFilter("ALL")} /><FilterChip active={statusFilter === "OPEN"} label="Offen" onClick={() => setStatusFilter("OPEN")} /><FilterChip active={statusFilter === "DONE"} label="Erledigt" onClick={() => setStatusFilter("DONE")} /></div></div></div>
        {error && <p className="mb-4 rounded-xl px-4 py-3 text-sm font-bold" style={{ color: "var(--color-destructive)", backgroundColor: "#fee2e2" }}>{error}</p>}
        {visible.length === 0 ? <p className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--color-border)" }}>Für diese Auswahl gibt es keine Aufgaben.</p> : <TaskSections instances={visible} currentMemberId={currentMember?.id ?? null} isParent={Boolean(isParent)} onComplete={handleComplete} onShare={(id) => handleComplete(id, true)} onReopen={handleReopen} onUndo={handleUndo} />}
      </section>
    </main>
  );
}

function ProfilePanel({ activeMember }: { activeMember: Member | null }) {
  if (activeMember) return <section className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "var(--color-border)", backgroundColor: `${activeMember.color}12` }}><p className="text-sm font-bold uppercase tracking-wide" style={{ color: activeMember.color }}>Profil aktiv</p><h2 className="mt-1 text-3xl font-bold">{activeMember.emoji} {activeMember.display_name}</h2><InspirationalQuote key={activeMember.id} /><p className="mt-3 text-sm" style={{ opacity: 0.75 }}>{activeMember.role === "PARENT" ? "Du kannst Aufgaben verwalten und deine eigenen Aufgaben erledigen." : "Du kannst deine Aufgaben erledigen oder einen halben Anteil übernehmen."}</p></section>;
  return <section className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}><p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>PIN-Login</p><h2 className="mt-1 text-3xl font-bold">Wer hilft heute mit?</h2><p className="mt-1 text-sm" style={{ opacity: 0.7 }}>Mit deiner sechsstelligen PIN wird dein Profil automatisch erkannt.</p><Link href="/login" className="touch-action mt-4 inline-flex items-center rounded-xl px-5 py-3 font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>Mit PIN anmelden</Link></section>;
}

function InspirationalQuote() {
  const [inspiration] = useState(randomInspiration);
  return <p className="mt-2 text-base font-semibold leading-snug" style={{ color: "var(--color-foreground)", opacity: 0.8 }}>„{inspiration.text}“ <span className="whitespace-nowrap">— {inspiration.author}</span></p>;
}

function Scoreboard({ stats }: { stats: MemberWeeklyStats[] }) {
  return <section className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}><div className="flex items-center gap-2"><Crown /><div><p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>Scoreboard</p><h2 className="text-3xl" style={{ fontFamily: "var(--font-scoreboard)" }}>Wer ist Super-Buchi?</h2></div></div><ol className="mt-4 space-y-2">{stats.map((stat, index) => { const leader = index === 0; return <li key={stat.member_id} className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: leader ? "#fef3c7" : "var(--color-background)", color: leader ? "#451a03" : "var(--color-foreground)", border: leader ? "1px solid #f59e0b" : "1px solid transparent" }}><span className="w-6 text-center font-bold" style={{ color: leader ? "#92400e" : stat.color }}>{index + 1}</span><span className="text-xl">{stat.emoji}</span><span className="min-w-0 flex-1 truncate font-bold">{stat.display_name}</span><span className="text-sm font-bold" style={{ color: leader ? "#78350f" : "var(--color-foreground)", opacity: leader ? 1 : 0.7 }}>{formatTasks(stat.completed_tasks)}</span><span className="rounded-full px-3 py-1 font-bold" style={{ backgroundColor: leader ? "#b45309" : stat.color, color: "#ffffff" }}>{formatPoints(stat.points)} P</span></li>; })}</ol></section>;
}

function TaskSections({ instances, currentMemberId, isParent, onComplete, onShare, onReopen, onUndo }: { instances: Instance[]; currentMemberId: number | null; isParent: boolean; onComplete: (id: number) => void; onShare: (id: number) => void; onReopen: (id: number) => void; onUndo: (id: number) => void }) {
  const sections = [
    { key: "DAILY", title: "Tagesaufgaben", subtitle: "Heute und frühere Tage", color: "var(--color-primary)" },
    { key: "WEEKLY", title: "Wochenaufgaben", subtitle: "Diese Woche erledigbar", color: "var(--color-secondary)" },
    { key: "MONTHLY", title: "Monatsaufgaben", subtitle: "Diesen Monat erledigbar", color: "var(--color-accent)" },
    { key: "MANUAL", title: "Zusätzliche Aufgaben", subtitle: "Einmalige Aufgaben und Zeiträume", color: "#7c3aed" },
  ] as const;
  return <div className="space-y-6">{sections.map((section) => { const grouped = groupByDay(instances.filter((instance) => instance.category === section.key)); if (!grouped.length) return null; return <section key={section.key}><div className="mb-2"><h3 className="text-2xl font-bold" style={{ color: section.color }}>{section.title}</h3><p className="text-sm" style={{ opacity: 0.7 }}>{section.subtitle}</p></div><div className="space-y-3">{grouped.map((group) => <details key={group.date} open={group.isToday} className="rounded-2xl border" style={{ borderColor: group.isToday ? section.color : "var(--color-border)", backgroundColor: "var(--color-background)" }}><summary className="touch-action flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"><span>{group.isToday ? "Heute · " : ""}{formatDay(group.date)}</span><span className="rounded-full px-2 py-1 text-xs" style={{ backgroundColor: "var(--color-muted)" }}>{group.instances.length}</span></summary><motion.ul className="grid gap-3 px-3 pb-3 pt-1 lg:grid-cols-2" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}><AnimatePresence>{group.instances.map((instance) => <TaskCard key={instance.id} instance={instance} onComplete={onComplete} onShare={onShare} onReopen={isParent ? onReopen : undefined} onUndo={onUndo} canUndo={Boolean(currentMemberId && instance.contributions.some((contribution) => contribution.member_id === currentMemberId))} showCompletionDetails />)}</AnimatePresence></motion.ul></details>)}</div></section>; })}</div>;
}

function FilterChip({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold" style={{ borderColor: active ? color ?? "var(--color-primary)" : "var(--color-border)", backgroundColor: active ? `${color ?? "#2563eb"}1a` : "transparent" }}>{label}</button>; }
function Crown() { return <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 4 4 5-7 5 7 4-4-2 12H5z" /><path d="M5 21h14" /></svg>; }
function currentWeekBounds() { const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()); const end = new Date(start); end.setDate(start.getDate() + 6); return { start, end }; }
function formatDate(date: Date) { return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date); }
function formatLongDate(date: Date) { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date); }
function formatTasks(value: number) { return `${value % 1 ? value.toFixed(1).replace(".", ",") : value} Aufgaben`; }
function formatPoints(value: number) { return value % 1 ? value.toFixed(1).replace(".", ",") : value; }
function groupByDay(instances: Instance[]) { const today = toIsoDate(new Date()); const grouped = new Map<string, Instance[]>(); instances.forEach((instance) => { const list = grouped.get(instance.due_date) ?? []; list.push(instance); grouped.set(instance.due_date, list); }); return [...grouped.entries()].sort(([left], [right]) => { if (left === today) return -1; if (right === today) return 1; return left.localeCompare(right); }).map(([date, entries]) => ({ date, instances: entries, isToday: date === today })); }
function toIsoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDay(date: string) { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${date}T12:00:00`)); }
