"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  createChildMember,
  createChore,
  createParentMember,
  deleteChore,
  getChores,
  getManagedMembers,
  getMembers,
  updateChildMember,
  updateChore,
  updateParentMember,
  type Chore,
  type ChoreInput,
  type ManagedMember,
  type Member,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";
import { useSound } from "@/lib/useSound";

type FormValues = {
  title: string;
  description: string;
  icon: string;
  color: string;
  points: string;
  assigneeIds: string[];
  recurring: boolean;
  frequency: string;
  interval: string;
  startDate: string;
  dueDate: string;
  endDate: string;
};

type ManageSection = "CHORES" | "MEMBERS";

function emptyForm(): FormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: "",
    description: "",
    icon: "",
    color: "#2563EB",
    points: "5",
    assigneeIds: [],
    recurring: true,
    frequency: "WEEKLY",
    interval: "1",
    startDate: today,
    dueDate: today,
    endDate: "",
  };
}

function formForChore(chore: Chore): FormValues {
  return {
    title: chore.title,
    description: chore.description,
    icon: chore.icon,
    color: chore.color,
    points: String(chore.points),
    assigneeIds: chore.default_assignee_ids.map(String),
    recurring: chore.is_recurring,
    frequency: chore.recurrence?.frequency ?? "WEEKLY",
    interval: String(chore.recurrence?.interval ?? 1),
    startDate: chore.recurrence?.start_date ?? new Date().toISOString().slice(0, 10),
    dueDate: chore.due_date ?? new Date().toISOString().slice(0, 10),
    endDate: chore.end_date ?? "",
  };
}

export default function ManagePage() {
  const router = useRouter();
  const { state: authState } = useAuth();
  const { playJingle } = useSound();
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [managedMembers, setManagedMembers] = useState<ManagedMember[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [memberStatus, setMemberStatus] = useState<string | null>(null);
  const [memberPending, setMemberPending] = useState(false);
  const [parentForm, setParentForm] = useState({ displayName: "", email: "", pin: "" });
  const [childForm, setChildForm] = useState({ displayName: "", pin: "" });
  const [newPins, setNewPins] = useState<Record<number, string>>({});
  const [parentEmails, setParentEmails] = useState<Record<number, string>>({});
  const [jingles, setJingles] = useState<Record<number, { completion: string; undo: string }>>({});
  const [taskImage, setTaskImage] = useState<File | null>(null);
  const [section, setSection] = useState<ManageSection>("CHORES");
  const isParent =
    authState.kind === "authenticated" && authState.me.member.role === "PARENT";

  async function load() {
    const [loadedChores, loadedMembers, loadedManagedMembers] = await Promise.all([
      getChores(),
      getMembers(),
      getManagedMembers(),
    ]);
    setChores(loadedChores);
    setMembers(loadedMembers);
    setManagedMembers(loadedManagedMembers);
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

  function update(field: keyof FormValues, value: string | boolean | string[]) {
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
      default_assignee_id: form.assigneeIds[0] ? Number(form.assigneeIds[0]) : null,
      default_assignee_ids: form.assigneeIds.map(Number),
      due_date: form.recurring ? null : form.dueDate,
      end_date: form.recurring || !form.endDate ? null : form.endDate,
      recurrence: form.recurring
        ? {
            frequency: form.frequency,
            interval: Math.max(1, Number(form.interval) || 1),
            weekdays: [],
            day_of_month: null,
            start_date: form.startDate,
            end_date: null,
          }
        : null,
    };
    try {
      const saved = editingId === null
        ? await createChore(payload)
        : await updateChore(editingId, payload);
      if (taskImage) {
        const { uploadChoreImage } = await import("@/lib/api");
        await uploadChoreImage(saved.id, taskImage);
      }
      await load();
      setForm(emptyForm());
      setTaskImage(null);
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

  async function addParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberPending(true);
    setMemberStatus(null);
    try {
      await createParentMember({
        display_name: parentForm.displayName,
        email: parentForm.email,
        pin: parentForm.pin,
      });
      setParentForm({ displayName: "", email: "", pin: "" });
      await load();
      setMemberStatus("Elternkonto angelegt.");
    } catch {
      setMemberStatus("Elternkonto konnte nicht angelegt werden. Prüfe E-Mail und die sechsstellige PIN.");
    } finally {
      setMemberPending(false);
    }
  }

  async function addChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberPending(true);
    setMemberStatus(null);
    try {
      await createChildMember({ display_name: childForm.displayName, pin: childForm.pin });
      setChildForm({ displayName: "", pin: "" });
      await load();
      setMemberStatus("Kinderprofil angelegt.");
    } catch {
      setMemberStatus("Kinderprofil konnte nicht angelegt werden. Die PIN muss sechs Ziffern haben und darf noch nicht verwendet werden.");
    } finally {
      setMemberPending(false);
    }
  }

  async function changePin(member: ManagedMember) {
    const pin = newPins[member.id];
    if (!pin) {
      return;
    }
    setMemberPending(true);
    setMemberStatus(null);
    try {
      await updateChildMember(member.id, { display_name: member.display_name, pin, color: member.color, emoji: member.emoji });
      setNewPins((pins) => ({ ...pins, [member.id]: "" }));
      setMemberStatus(`PIN für ${member.display_name} geändert.`);
    } catch {
      setMemberStatus("PIN konnte nicht geändert werden. Sie muss aus sechs Ziffern bestehen und darf noch nicht verwendet werden.");
    } finally {
      setMemberPending(false);
    }
  }

  async function changeParentPin(member: ManagedMember) {
    const pin = newPins[member.id];
    if (!pin) return;
    setMemberPending(true);
    setMemberStatus(null);
    try {
      await updateParentMember(member.id, { display_name: member.display_name, email: parentEmails[member.id] ?? member.email ?? "", pin, color: member.color, emoji: member.emoji });
      setNewPins((pins) => ({ ...pins, [member.id]: "" }));
      setMemberStatus(`PIN für ${member.display_name} geändert.`);
    } catch {
      setMemberStatus("PIN konnte nicht geändert werden. Sie muss aus sechs Ziffern bestehen und darf noch nicht verwendet werden.");
    } finally {
      setMemberPending(false);
    }
  }

  async function changeParentEmail(member: ManagedMember) {
    const email = (parentEmails[member.id] ?? member.email ?? "").trim();
    if (!email) return;
    setMemberPending(true);
    setMemberStatus(null);
    try {
      await updateParentMember(member.id, { display_name: member.display_name, email, color: member.color, emoji: member.emoji });
      setParentEmails((emails) => ({ ...emails, [member.id]: email }));
      await load();
      setMemberStatus(`E-Mail für ${member.display_name} geändert.`);
    } catch {
      setMemberStatus("E-Mail konnte nicht geändert werden. Prüfe, ob sie gültig und noch frei ist.");
    } finally {
      setMemberPending(false);
    }
  }

  async function selectJingle(member: ManagedMember, type: "completion" | "undo", value: string) {
    const selected = {
      completion: type === "completion" ? value : jingles[member.id]?.completion ?? member.completion_jingle,
      undo: type === "undo" ? value : jingles[member.id]?.undo ?? member.undo_jingle,
    };
    setJingles((current) => ({ ...current, [member.id]: selected }));
    playJingle(value, type === "undo" ? "click" : "success");
    setMemberPending(true);
    setMemberStatus(null);
    try {
      const updated = await updateChildMember(member.id, {
        display_name: member.display_name,
        color: member.color,
        emoji: member.emoji,
        completion_jingle: selected.completion,
        undo_jingle: selected.undo,
      });
      setManagedMembers((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setMemberStatus("Die Jingles konnten nicht gespeichert werden.");
    } finally {
      setMemberPending(false);
    }
  }

  if (authState.kind !== "authenticated" || authState.me.member.role !== "PARENT") {
    return <main className="flex flex-1 items-center justify-center">Lädt…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>Elternbereich</p>
          <h1 className="text-4xl font-bold">Verwalten</h1>
        </div>
        <Link href="/" className="cursor-pointer rounded-xl border px-4 py-2 font-bold transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: "var(--color-border)" }}>
          Zum Dashboard
        </Link>
      </header>
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border p-1.5" style={{ borderColor: "var(--color-border)", backgroundColor: "color-mix(in srgb, var(--color-muted) 76%, transparent)" }}>
        <ManageTab active={section === "CHORES"} label="Aufgaben" onClick={() => setSection("CHORES")} />
        <ManageTab active={section === "MEMBERS"} label="Mitglieder verwalten" onClick={() => setSection("MEMBERS")} />
      </div>
      {section === "CHORES" && <div className="grid gap-5 md:grid-cols-[minmax(15rem,0.76fr)_minmax(0,1.24fr)] md:items-start">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Bestehende Aufgaben</h2><button type="button" onClick={() => { setEditingId(null); setTaskImage(null); setForm(emptyForm()); setStatus(null); }} className="touch-action cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>+ Neu</button></div>
          <ul className="space-y-3 md:max-h-[calc(100vh-17rem)] md:overflow-y-auto md:pr-2">
            {chores.map((chore) => (
              <li key={chore.id} className="rounded-2xl border p-3" style={{ borderColor: editingId === chore.id ? chore.color : "var(--color-border)", backgroundColor: editingId === chore.id ? `${chore.color}0d` : "var(--color-background)" }}>
                <button type="button" className="w-full min-w-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2" onClick={() => { setEditingId(chore.id); setTaskImage(null); setForm(formForChore(chore)); setStatus(null); }}>
                  <span className="block truncate text-lg font-bold">{chore.image_url ? <Image src={chore.image_url} alt="" width={32} height={32} unoptimized className="mr-2 inline-block h-8 w-8 rounded-lg object-cover align-middle" /> : chore.icon && <span aria-hidden>{chore.icon} </span>}{chore.title}</span>
                  <span className="text-sm" style={{ opacity: 0.7 }}>{chore.is_recurring ? `${chore.recurrence?.frequency === "DAILY" ? "Täglich" : chore.recurrence?.frequency === "MONTHLY" ? "Monatlich" : chore.recurrence?.interval === 2 ? "Alle 2 Wochen" : "Wöchentlich"} · feste Zuweisung` : `Am ${chore.due_date}`}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">{assigneesForChore(editingId === chore.id ? form.assigneeIds : chore.default_assignee_ids.map(String), members).length > 0 ? assigneesForChore(editingId === chore.id ? form.assigneeIds : chore.default_assignee_ids.map(String), members).map((member) => <span key={member.id} className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: `${member.color}1a`, color: member.color }}>{member.emoji} {member.display_name}</span>) : <span className="text-xs" style={{ opacity: 0.65 }}>Keine feste Zuweisung</span>}</span>
                </button>
              </li>
            ))}
          </ul>
          {chores.length === 0 && <p className="mt-4" style={{ opacity: 0.7 }}>Noch keine Aufgaben angelegt.</p>}
        </section>
        <section className="rounded-[20px] border p-5 sm:p-6 md:sticky md:top-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{editingId === null ? "Neue Aufgabe" : "Aufgabe bearbeiten"}</h2>{editingId !== null && <div className="flex gap-2"><button type="button" aria-label="Aufgabe kopieren" className="touch-action inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2" onClick={() => { const chore = chores.find((item) => item.id === editingId); if (chore) { setEditingId(null); setTaskImage(null); setForm({ ...formForChore(chore), title: `${chore.title} (Kopie)` }); setStatus("Kopie vorbereitet – anpassen und speichern."); } }} style={{ color: "var(--color-primary)", borderColor: "var(--color-primary)" }}><CopyIcon />Kopieren</button><button type="button" aria-label="Aufgabe löschen" className="touch-action inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2" onClick={() => { const chore = chores.find((item) => item.id === editingId); if (chore) void remove(chore); }} style={{ color: "var(--color-destructive)", borderColor: "var(--color-destructive)" }}><TrashIcon />Löschen</button></div>}</div>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label="Titel"><input required value={form.title} onChange={(event) => update("title", event.target.value)} className="input" /></Field>
            <Field label="Beschreibung"><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="input min-h-20" /></Field>
            <Field label="Aufgabenbild (optional)"><input type="file" accept="image/*" onChange={(event) => setTaskImage(event.currentTarget.files?.[0] ?? null)} className="input file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:px-3 file:py-2 file:font-bold" />{taskImage ? <span className="mt-1 block text-xs" style={{ color: "var(--color-secondary)" }}>Neues Bild ausgewählt: {taskImage.name}</span> : editingId !== null && chores.find((chore) => chore.id === editingId)?.image_url ? <span className="mt-1 block text-xs" style={{ opacity: 0.7 }}>Ein Aufgabenbild ist bereits hinterlegt und erscheint dezent als Kartenhintergrund.</span> : <span className="mt-1 block text-xs" style={{ opacity: 0.7 }}>Füllt die Aufgabenkarte dezent als Hintergrundbild.</span>}</Field>
            <div className="grid grid-cols-3 gap-3"><Field label="Icon"><IconAutocomplete key={form.icon} value={form.icon} onChange={(icon) => update("icon", icon)} /></Field><Field label="Farbe"><input type="color" value={form.color} onChange={(event) => update("color", event.target.value)} className="input h-12 p-1" /></Field><Field label="Punkte"><input type="number" min="0" value={form.points} onChange={(event) => update("points", event.target.value)} className="input" /></Field></div>
            <Field label="Zugewiesen an"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{members.map((member) => { const selected = form.assigneeIds.includes(String(member.id)); return <button key={member.id} type="button" aria-pressed={selected} onClick={() => update("assigneeIds", selected ? form.assigneeIds.filter((id) => id !== String(member.id)) : [...form.assigneeIds, String(member.id)])} className="touch-action min-h-12 cursor-pointer rounded-xl border px-3 py-2 text-left text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: selected ? member.color : "var(--color-border)", backgroundColor: selected ? `${member.color}1a` : "var(--color-background)" }}>{selected ? "✓ " : ""}{member.emoji} {member.display_name}</button>; })}</div><span className="mt-2 block text-xs" style={{ opacity: 0.75 }}>Antippen wählt ein Mitglied aus oder wieder ab. Für keine feste Zuweisung alle ausgewählten Personen erneut antippen und danach speichern.</span></Field>
            <label className="flex cursor-pointer items-center gap-3 font-bold"><input type="checkbox" checked={form.recurring} onChange={(event) => update("recurring", event.target.checked)} /> Wiederkehrende Aufgabe</label>
            {form.recurring ? <div className="grid grid-cols-2 gap-3"><Field label="Frequenz"><select value={form.frequency} onChange={(event) => update("frequency", event.target.value)} className="input"><option value="DAILY">Täglich</option><option value="WEEKLY">Wöchentlich</option><option value="MONTHLY">Monatlich</option></select></Field><Field label={form.frequency === "WEEKLY" ? "Wiederholung" : "Intervall"}>{form.frequency === "WEEKLY" ? <select value={form.interval} onChange={(event) => update("interval", event.target.value)} className="input"><option value="1">Jede Woche</option><option value="2">Alle 2 Wochen</option></select> : <input type="number" min="1" value={form.interval} onChange={(event) => update("interval", event.target.value)} className="input" />}</Field><Field label="Startdatum"><input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} className="input" /></Field></div> : <div className="grid grid-cols-2 gap-3"><Field label="Aktiv ab"><input type="date" value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} className="input" /></Field><Field label="Aktiv bis (optional)"><input type="date" min={form.dueDate} value={form.endDate} onChange={(event) => update("endDate", event.target.value)} className="input" /></Field></div>}
            {status && <p className="text-sm font-semibold" style={{ color: status === "Aufgabe gespeichert." ? "var(--color-secondary)" : "var(--color-destructive)" }}>{status}</p>}
            <div className="flex gap-3"><button type="submit" disabled={pending} className="touch-action inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-accent)" }}><SaveIcon />{pending ? "Speichert…" : "Speichern"}</button>{editingId !== null && <button type="button" onClick={() => { setEditingId(null); setTaskImage(null); setForm(emptyForm()); }} className="touch-action inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 font-bold" style={{ borderColor: "var(--color-border)" }}><CancelIcon />Abbrechen</button>}</div>
          </form>
        </section>
      </div>}
      {section === "MEMBERS" && <section style={{ borderColor: "var(--color-border)" }}>
        <div className="mb-5">
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>Familie</p>
          <h2 className="text-2xl font-bold">Mitglieder verwalten</h2>
          <p className="mt-1 text-sm" style={{ opacity: 0.7 }}>Eltern erhalten einen eigenen Login; Kinder melden sich über ihr Profil und eine PIN an.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(15rem,0.76fr)_minmax(0,1.24fr)] md:items-start">
          <div className="space-y-3 md:max-h-[calc(100vh-17rem)] md:overflow-y-auto md:pr-2">
            {managedMembers.map((member) => (
              <article key={member.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{member.emoji} {member.display_name}</p>
                    <p className="text-sm" style={{ opacity: 0.7 }}>{member.role === "PARENT" ? `Elternteil · ${member.email}` : "Kind · PIN geschützt"}</p>
                  </div>
                  <span className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: `${member.color}1a`, color: member.color }}>{member.role === "PARENT" ? "Eltern" : "Kind"}</span>
                </div>
                {member.role === "PARENT" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <input type="email" value={parentEmails[member.id] ?? member.email ?? ""} onChange={(event) => setParentEmails((emails) => ({ ...emails, [member.id]: event.target.value }))} className="input min-w-56 flex-1 py-2" aria-label={`E-Mail für ${member.display_name}`} />
                      <button type="button" disabled={memberPending} onClick={() => void changeParentEmail(member)} className="touch-action cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>E-Mail speichern</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="Neue 6-stellige PIN" value={newPins[member.id] ?? ""} onChange={(event) => setNewPins((pins) => ({ ...pins, [member.id]: event.target.value.replace(/\D/g, "") }))} className="input max-w-56 py-2" aria-label={`Neue PIN für ${member.display_name}`} />
                      <button type="button" disabled={memberPending} onClick={() => void changeParentPin(member)} className="touch-action cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>PIN ändern</button>
                    </div>
                  </div>
                )}
                {member.role === "CHILD" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="Neue 6-stellige PIN"
                      value={newPins[member.id] ?? ""}
                      onChange={(event) => setNewPins((pins) => ({ ...pins, [member.id]: event.target.value.replace(/\D/g, "") }))}
                      className="input max-w-40 py-2"
                      aria-label={`Neue PIN für ${member.display_name}`}
                      />
                      <button type="button" disabled={memberPending} onClick={() => void changePin(member)} className="touch-action cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>PIN ändern</button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Jingle: erledigt"><select disabled={memberPending} value={jingles[member.id]?.completion ?? member.completion_jingle} onChange={(event) => void selectJingle(member, "completion", event.target.value)} className="input"><PositiveJingleOptions /></select></Field>
                      <Field label="Jingle: abgewählt"><select disabled={memberPending} value={jingles[member.id]?.undo ?? member.undo_jingle} onChange={(event) => void selectJingle(member, "undo", event.target.value)} className="input"><NegativeJingleOptions /></select></Field>
                    </div>
                    <p className="text-xs" style={{ opacity: 0.72 }}>Die Auswahl wird sofort abgespielt und automatisch gespeichert.</p>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="grid content-start gap-5 md:sticky md:top-4">
            <form onSubmit={addParent} className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-xl font-bold">Elternteil hinzufügen</h3>
              <div className="mt-3 space-y-3">
                <Field label="Name"><input required value={parentForm.displayName} onChange={(event) => setParentForm((value) => ({ ...value, displayName: event.target.value }))} className="input" /></Field>
                <Field label="E-Mail"><input required type="email" value={parentForm.email} onChange={(event) => setParentForm((value) => ({ ...value, email: event.target.value }))} className="input" /></Field>
                <Field label="Sechsstellige PIN"><input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={parentForm.pin} onChange={(event) => setParentForm((value) => ({ ...value, pin: event.target.value.replace(/\D/g, "") }))} className="input" /></Field>
                <button type="submit" disabled={memberPending} className="cursor-pointer rounded-xl px-4 py-3 font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>Elternkonto anlegen</button>
              </div>
            </form>
            <form onSubmit={addChild} className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-xl font-bold">Kind hinzufügen</h3>
              <div className="mt-3 space-y-3">
                <Field label="Name"><input required value={childForm.displayName} onChange={(event) => setChildForm((value) => ({ ...value, displayName: event.target.value }))} className="input" /></Field>
                <Field label="Sechsstellige PIN"><input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={childForm.pin} onChange={(event) => setChildForm((value) => ({ ...value, pin: event.target.value.replace(/\D/g, "") }))} className="input" /></Field>
                <button type="submit" disabled={memberPending} className="cursor-pointer rounded-xl px-4 py-3 font-bold text-white disabled:opacity-50" style={{ backgroundColor: "var(--color-secondary)" }}>Kinderprofil anlegen</button>
              </div>
            </form>
            {memberStatus && <p className="text-sm font-semibold" style={{ color: memberStatus.includes("konnte") ? "var(--color-destructive)" : "var(--color-secondary)" }}>{memberStatus}</p>}
          </div>
        </div>
      </section>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-bold"><span className="mb-1 block">{label}</span>{children}</label>;
}

function ManageTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className="touch-action cursor-pointer rounded-xl px-3 py-3 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2" style={{ backgroundColor: active ? "var(--color-background)" : "transparent", color: active ? "var(--color-primary)" : "var(--color-foreground)", boxShadow: active ? "0 2px 8px rgba(15,23,42,0.08)" : "none" }}>{label}</button>;
}

function CopyIcon() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="13" height="13" x="8" y="8" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>;
}

function SaveIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h12l4 4v14H3V3z" /><path d="M7 3v6h10V3M8 21v-7h8v7" /></svg>;
}

function CancelIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

function PositiveJingleOptions() {
  return <><option value="SPARKLE">Glitzer</option><option value="BELL">Glocke</option><option value="FANFARE">Fanfare</option><option value="BUBBLE">Blubber</option><option value="CELEBRATE">Jubel</option></>;
}

function NegativeJingleOptions() {
  return <><option value="SOFT">Sanft</option><option value="DOWNBEAT">Abwärts</option><option value="RAIN">Regen</option><option value="PLOP">Plopp</option><option value="RESET">Neustart</option></>;
}

function assigneesForChore(ids: string[], members: Member[]) {
  const assigned = new Set(ids);
  return members.filter((member) => assigned.has(String(member.id)));
}

const TASK_ICONS = [
  ["🛁", "Bad", "bad badezimmer wanne"], ["🚿", "Brause", "bad dusche badezimmer"], ["🪞", "Spiegel", "bad badezimmer"], ["🧼", "Seife", "bad waschen"], ["🪥", "Zähne putzen", "bad zähne"],
  ["🧹", "Staubsaugen", "putzen boden"], ["🧽", "Wischen", "putzen tisch"], ["🧺", "Wäsche", "waschen kleidung"], ["👕", "Kleidung", "wäsche aufräumen"], ["🛏️", "Bett", "zimmer aufräumen schlafen"],
  ["🍽️", "Geschirr", "küche spülmaschine"], ["🍳", "Kochen", "küche essen"], ["🗑️", "Müll", "tonne rausbringen"], ["♻️", "Recycling", "müll wertstoff"], ["🪴", "Pflanzen", "gießen garten"],
  ["🐕", "Hund", "haustier gassi"], ["🐈", "Katze", "haustier füttern"], ["🛒", "Einkaufen", "supermarkt"], ["📚", "Hausaufgaben", "schule lernen"], ["✏️", "Lernen", "schule schreiben"],
  ["⚽", "Sport", "training fußball"], ["🚲", "Fahrrad", "sport fahren"], ["🚗", "Auto", "waschen fahren"], ["📦", "Aufräumen", "ordnung kiste"], ["🧸", "Spielzeug", "zimmer aufräumen"],
  ["🪟", "Fenster", "putzen"], ["🌳", "Garten", "draußen"], ["🐟", "Aquarium", "haustier füttern"], ["💻", "Computer", "medien"], ["📮", "Post", "briefkasten"],
] as const;

function IconAutocomplete({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState(() => TASK_ICONS.find(([icon]) => icon === value)?.[1] ?? value);
  const [open, setOpen] = useState(false);
  const matches = query.trim()
    ? TASK_ICONS.filter(([, label, keywords]) => `${label} ${keywords}`.toLocaleLowerCase("de-DE").includes(query.toLocaleLowerCase("de-DE")))
    : TASK_ICONS;
  return <span className="relative block"><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Icon suchen oder Liste öffnen" className="input" />{open && <span className="absolute z-20 mt-1 block max-h-72 w-full overflow-y-auto rounded-xl border p-1" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)" }}>{matches.map(([icon, label]) => <button key={icon} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(icon); setQuery(label); setOpen(false); }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2"><span className="text-lg">{icon}</span>{label}</button>)}{matches.length === 0 && <span className="block px-3 py-2 text-sm" style={{ opacity: 0.7 }}>Kein passendes Icon.</span>}</span>}</span>;
}
