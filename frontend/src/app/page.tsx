"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PinLogin } from "@/components/PinLogin";
import { Celebration } from "@/components/Celebration";
import { TaskTile } from "@/components/TaskTile";
import { Scoreboard } from "@/components/Scoreboard";
import { ApiError, completeAlwaysAvailableChore, completeInstance, getDashboard, getPublicDashboard, reopenInstance, undoAlwaysAvailableCompletion, uncompleteInstance, updateOwnChildPin, type BoardTask, type Me, type PublicDashboard } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";
import { randomInspiration } from "@/lib/inspirations";

export default function Dashboard() {
  const { state: authState, logout } = useAuth();
  const pathname = usePathname();
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [celebration, setCelebration] = useState(0);
  const actionPending = useRef(false);
  const requestId = useRef(0);
  const [newChildPin, setNewChildPin] = useState("");
  const [childPinStatus, setChildPinStatus] = useState<string | null>(null);
  const [childPinPending, setChildPinPending] = useState(false);
  const { play, playJingle } = useSound();
  const currentMember = authState.kind === "authenticated" ? authState.me.member : null;
  const activeChild = currentMember?.role === "CHILD" ? currentMember : null;
  const isParent = currentMember?.role === "PARENT";
  const authenticated = authState.kind === "authenticated";
  const canAccessBackend = authenticated && Boolean(authState.me.user?.can_access_backend);
  const view = pathname === "/scoreboard" ? "scoreboard" : pathname === "/profile" ? "profile" : "tasks";

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(0), 1600);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  const loadDashboard = useCallback(async () => {
    const id = ++requestId.current;
    const data = await (authenticated ? getDashboard() : getPublicDashboard());
    if (id === requestId.current) { setDashboard(data); setError(null); }
  }, [authenticated]);

  const invalidateRequests = useCallback(() => { requestId.current++; }, []);

  useEffect(() => {
    if (authState.kind === "loading") return;
    const refresh = () => { if (!document.hidden && !actionPending.current) void loadDashboard().catch(() => setError("Die Aufgaben konnten nicht aktualisiert werden. Bitte erneut versuchen.")); };
    const timeout = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { invalidateRequests(); window.clearTimeout(timeout); window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [authState.kind, loadDashboard, invalidateRequests]);

  async function handleAction(task: BoardTask, action: "complete" | "share" | "undo" | "reopen" | "always_complete" | "always_undo") {
    if ((!task.instance && !task.is_always_available) || !currentMember || actionPending.current) return;
    actionPending.current = true;
    setPendingId(task.id);
    setError(null);
    // Ein älterer Leseabruf darf den neuen Abschluss nicht überschreiben.
    requestId.current++;
    try {
      if (action === "always_complete") {
        const completion = await completeAlwaysAvailableChore(task.id);
        setDashboard((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, completion_count_today: item.completion_count_today + 1, latest_always_available_completion: completion } : item) } : current);
        setCelebration((current) => current + 1);
        playJingle(currentMember.completion_jingle);
        void loadDashboard().catch(() => {});
        return;
      }
      if (action === "always_undo") {
        if (!task.latest_always_available_completion) return;
        await undoAlwaysAvailableCompletion(task.latest_always_available_completion.id);
        playJingle(currentMember.undo_jingle);
        void loadDashboard().catch(() => {});
        return;
      }
      if (!task.instance) return;
      const instance = action === "undo" ? await uncompleteInstance(task.instance.id)
        : action === "reopen" ? await reopenInstance(task.instance.id)
        : await completeInstance(task.instance.id, currentMember.id, action === "share");
      setDashboard((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, instance, available: instance.status === "OPEN" || instance.status === "PARTIAL", last_completion: instance.status === "DONE" ? instance : item.last_completion?.id === instance.id ? null : item.last_completion } : item) } : current);
      if (action === "complete") setCelebration((current) => current + 1);
      playJingle(action === "undo" || action === "reopen" ? currentMember.undo_jingle : currentMember.completion_jingle);
      void loadDashboard().catch(() => {});
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Speichern hat nicht geklappt. Bitte erneut versuchen.");
      play("error");
    } finally { actionPending.current = false; setPendingId(null); }
  }

  async function changeOwnChildPin() {
    if (!activeChild || newChildPin.length !== 6) { setChildPinStatus("Bitte gib eine sechsstellige PIN ein."); return; }
    setChildPinPending(true);
    try { await updateOwnChildPin(newChildPin); setNewChildPin(""); setChildPinStatus("Deine PIN wurde geändert."); }
    catch { setChildPinStatus("Die PIN konnte nicht geändert werden. Sie darf noch nicht verwendet werden."); }
    finally { setChildPinPending(false); }
  }

  const visible = dashboard?.tasks.filter((task) => filter === null || task.assigned_member_ids.length === 0 || task.assigned_member_ids.includes(filter)) ?? [];
  return <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
    {celebration > 0 && <Celebration key={celebration} />}
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold sm:text-3xl">{view === "tasks" ? "Aufgaben" : view === "scoreboard" ? "Scoreboard" : "Mein Profil"}</h1>
      {currentMember && <div className="flex flex-wrap gap-2">{isParent && <Link href="/history" className="button-secondary text-xs">Verlauf</Link>}{canAccessBackend && <Link href="/admin/" className="button-secondary text-xs">Backend</Link>}<button type="button" onClick={logout} className="button-secondary text-xs">Abmelden</button></div>}
    </header>
    {view === "tasks" && <>
      {currentMember ? <section className="mb-5"><h2 className="text-xl font-semibold">Hallo {currentMember.emoji} {currentMember.display_name}!</h2><p className="mt-1 text-sm" style={{ color: "var(--color-subtle-text)" }}>Was packen wir heute an?</p></section> : authState.kind === "anonymous" ? <PinLogin /> : <p className="mb-5 text-sm" role="status">Profil wird geladen…</p>}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Aufgaben nach Person filtern"><FilterChip active={filter === null} label="Alle" onClick={() => setFilter(null)} />{dashboard?.members.map((member) => <FilterChip key={member.id} active={filter === member.id} label={`${member.emoji} ${member.display_name}`} onClick={() => setFilter(member.id)} />)}</div>
      <p className="mb-4 text-xs" style={{ color: "var(--color-subtle-text)" }}>Antippen für Details und zum Abhaken.</p>
    </>}
    {error && <div role="alert" className="mb-4 rounded-xl border p-3 text-sm" style={{ color: "var(--color-destructive)", borderColor: "var(--color-border)" }}>{error}<button type="button" onClick={() => void loadDashboard().catch(() => {})} className="ml-2 cursor-pointer underline">Erneut laden</button></div>}
    {view === "profile" ? <ProfilePanel activeMember={currentMember} childPin={newChildPin} childPinPending={childPinPending} childPinStatus={childPinStatus} onChildPinChange={setNewChildPin} onChangeOwnChildPin={() => void changeOwnChildPin()} /> : dashboard ? view === "scoreboard" ? <Scoreboard data={dashboard.scoreboard} /> : visible.length ? <ul className="grid grid-cols-2 items-start gap-3 sm:gap-4">{visible.map((task) => <TaskTile key={task.id} task={task} memberId={currentMember?.id ?? null} isParent={Boolean(isParent)} pending={pendingId === task.id} onAction={handleAction} />)}</ul> : <p className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--color-border)" }}>Für diese Auswahl gibt es keine Aufgaben.</p> : !error && <div role="status" aria-label="Aufgaben werden geladen" className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((id) => <div key={id} className="h-44 animate-pulse rounded-2xl" style={{ backgroundColor: "var(--color-muted)" }} />)}</div>}
  </main>;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`text-xs ${active ? "button-primary" : "button-secondary"}`}>{label}</button>;
}

function ProfilePanel({ activeMember, childPin, childPinPending, childPinStatus, onChildPinChange, onChangeOwnChildPin }: { activeMember: Me["member"] | null; childPin: string; childPinPending: boolean; childPinStatus: string | null; onChildPinChange: (pin: string) => void; onChangeOwnChildPin: () => void }) {
  if (activeMember) return <section className="rounded-[20px] border p-5 sm:p-6" style={{ borderColor: "var(--color-border)", backgroundColor: `${activeMember.color}12` }}><p className="text-sm font-bold uppercase tracking-wide" style={{ color: activeMember.color }}>Profil aktiv</p><h2 className="mt-1 text-2xl font-semibold">{activeMember.emoji} {activeMember.display_name}</h2><InspirationalQuote key={activeMember.id} /><p className="mt-3 text-sm" style={{ opacity: 0.75 }}>{activeMember.role === "PARENT" ? "Du kannst Aufgaben verwalten und deine eigenen Aufgaben erledigen." : "Du kannst deine Aufgaben erledigen oder einen halben Anteil übernehmen."}</p>{activeMember.role === "CHILD" && <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border)" }}><p className="text-sm font-bold">Eigene PIN ändern</p><div className="mt-2 flex flex-wrap gap-2"><input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={childPin} onChange={(event) => onChildPinChange(event.target.value.replace(/\D/g, ""))} placeholder="Neue 6-stellige PIN" className="input max-w-52 py-2" aria-label="Neue eigene PIN" /><button type="button" disabled={childPinPending} onClick={onChangeOwnChildPin} className="touch-action cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>PIN speichern</button></div>{childPinStatus && <p className="mt-2 text-sm font-semibold" style={{ color: childPinStatus.startsWith("Deine") ? "var(--color-secondary)" : "var(--color-destructive)" }}>{childPinStatus}</p>}</div>}</section>;
  return <PinLogin />;
}

function InspirationalQuote() {
  const [inspiration] = useState(randomInspiration);
  return <p className="mt-2 text-base font-semibold leading-snug" style={{ color: "var(--color-foreground)", opacity: 0.8 }}>„{inspiration.text}“ <span className="whitespace-nowrap">— {inspiration.author}</span></p>;
}
