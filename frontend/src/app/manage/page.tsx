"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  createChore,
  deleteChore,
  getChores,
  getMembers,
  updateChore,
  type Chore,
  type ChoreInput,
  type Member,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";

type FormValues = {
  title: string;
  description: string;
  icon: string;
  color: string;
  points: string;
  assigneeId: string;
  recurring: boolean;
  frequency: string;
  startDate: string;
  dueDate: string;
};

function emptyForm(): FormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: "",
    description: "",
    icon: "",
    color: "#2563EB",
    points: "5",
    assigneeId: "",
    recurring: true,
    frequency: "WEEKLY",
    startDate: today,
    dueDate: today,
  };
}

function formForChore(chore: Chore): FormValues {
  return {
    title: chore.title,
    description: chore.description,
    icon: chore.icon,
    color: chore.color,
    points: String(chore.points),
    assigneeId: chore.default_assignee_id ? String(chore.default_assignee_id) : "",
    recurring: chore.is_recurring,
    frequency: chore.recurrence?.frequency ?? "WEEKLY",
    startDate: chore.recurrence?.start_date ?? new Date().toISOString().slice(0, 10),
    dueDate: chore.due_date ?? new Date().toISOString().slice(0, 10),
  };
}

export default function ManagePage() {
  const router = useRouter();
  const { state: authState } = useAuth();
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isParent =
    authState.kind === "authenticated" && authState.me.member.role === "PARENT";

  async function load() {
    const [loadedChores, loadedMembers] = await Promise.all([getChores(), getMembers()]);
    setChores(loadedChores);
    setMembers(loadedMembers);
  }

  useEffect(() => {
    if (authState.kind === "anonymous") {
      router.replace("/login");
      return;
    }
    if (authState.kind === "authenticated" && !isParent) {
      router.replace("/");
      return;
    }
    if (authState.kind === "authenticated") {
      const timeout = window.setTimeout(() => {
        void load().catch(() => setStatus("Aufgaben konnten nicht geladen werden."));
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [authState.kind, isParent, router]);

  function update(field: keyof FormValues, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    const payload: ChoreInput = {
      title: form.title,
      description: form.description,
      icon: form.icon,
      color: form.color,
      points: Number(form.points),
      is_recurring: form.recurring,
      default_assignee_id: form.assigneeId ? Number(form.assigneeId) : null,
      due_date: form.recurring ? null : form.dueDate,
      recurrence: form.recurring
        ? {
            frequency: form.frequency,
            interval: 1,
            weekdays: [],
            day_of_month: null,
            start_date: form.startDate,
            end_date: null,
          }
        : null,
    };
    try {
      if (editingId === null) {
        await createChore(payload);
      } else {
        await updateChore(editingId, payload);
      }
      await load();
      setForm(emptyForm());
      setEditingId(null);
      setStatus("Aufgabe gespeichert.");
    } catch {
      setStatus("Die Aufgabe konnte nicht gespeichert werden.");
    } finally {
      setPending(false);
    }
  }

  async function remove(chore: Chore) {
    if (!window.confirm(`„${chore.title}“ wirklich löschen?`)) {
      return;
    }
    try {
      await deleteChore(chore.id);
      await load();
      if (editingId === chore.id) {
        setEditingId(null);
        setForm(emptyForm());
      }
    } catch {
      setStatus("Die Aufgabe konnte nicht gelöscht werden.");
    }
  }

  if (authState.kind !== "authenticated" || authState.me.member.role !== "PARENT") {
    return <main className="flex flex-1 items-center justify-center">Lädt…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>Elternbereich</p>
          <h1 className="text-4xl font-bold">Aufgaben verwalten</h1>
        </div>
        <Link href="/" className="cursor-pointer rounded-xl border px-4 py-2 font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)" }}>
          Zum Dashboard
        </Link>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section>
          <h2 className="text-2xl font-bold">Bestehende Aufgaben</h2>
          <ul className="mt-4 space-y-3">
            {chores.map((chore) => (
              <li key={chore.id} className="flex items-center justify-between gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                <button type="button" className="min-w-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2" onClick={() => { setEditingId(chore.id); setForm(formForChore(chore)); }}>
                  <span className="block truncate text-lg font-bold">{chore.icon && <span aria-hidden>{chore.icon} </span>}{chore.title}</span>
                  <span className="text-sm" style={{ opacity: 0.7 }}>{chore.is_recurring ? `${chore.recurrence?.frequency === "DAILY" ? "Täglich" : chore.recurrence?.frequency === "MONTHLY" ? "Monatlich" : "Wöchentlich"} · feste Zuweisung` : `Am ${chore.due_date}`}</span>
                </button>
                <button type="button" className="cursor-pointer rounded-lg px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2" onClick={() => void remove(chore)} style={{ color: "var(--color-destructive)" }}>Löschen</button>
              </li>
            ))}
          </ul>
          {chores.length === 0 && <p className="mt-4" style={{ opacity: 0.7 }}>Noch keine Aufgaben angelegt.</p>}
        </section>
        <section className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}>
          <h2 className="text-2xl font-bold">{editingId === null ? "Neue Aufgabe" : "Aufgabe bearbeiten"}</h2>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label="Titel"><input required value={form.title} onChange={(event) => update("title", event.target.value)} className="input" /></Field>
            <Field label="Beschreibung"><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="input min-h-20" /></Field>
            <div className="grid grid-cols-3 gap-3"><Field label="Icon"><input value={form.icon} onChange={(event) => update("icon", event.target.value)} className="input" /></Field><Field label="Farbe"><input type="color" value={form.color} onChange={(event) => update("color", event.target.value)} className="input h-12 p-1" /></Field><Field label="Punkte"><input type="number" min="0" value={form.points} onChange={(event) => update("points", event.target.value)} className="input" /></Field></div>
            <Field label="Zugewiesen an"><select value={form.assigneeId} onChange={(event) => update("assigneeId", event.target.value)} className="input"><option value="">Niemand</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></Field>
            <label className="flex cursor-pointer items-center gap-3 font-bold"><input type="checkbox" checked={form.recurring} onChange={(event) => update("recurring", event.target.checked)} /> Wiederkehrende Aufgabe</label>
            {form.recurring ? <div className="grid grid-cols-2 gap-3"><Field label="Frequenz"><select value={form.frequency} onChange={(event) => update("frequency", event.target.value)} className="input"><option value="DAILY">Täglich</option><option value="WEEKLY">Wöchentlich</option><option value="MONTHLY">Monatlich</option></select></Field><Field label="Startdatum"><input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} className="input" /></Field></div> : <Field label="Fällig am"><input type="date" value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} className="input" /></Field>}
            {status && <p className="text-sm font-semibold" style={{ color: status === "Aufgabe gespeichert." ? "var(--color-secondary)" : "var(--color-destructive)" }}>{status}</p>}
            <div className="flex gap-3"><button type="submit" disabled={pending} className="cursor-pointer rounded-xl px-4 py-3 font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-accent)" }}>{pending ? "Speichert…" : "Speichern"}</button>{editingId !== null && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="cursor-pointer rounded-xl border px-4 py-3 font-bold" style={{ borderColor: "var(--color-border)" }}>Abbrechen</button>}</div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-bold"><span className="mb-1 block">{label}</span>{children}</label>;
}
