"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, deleteReminder, getReminders, saveReminder, testNotificationDevice, updateNotificationDevice, type Chore, type Devices, type ManagedMember, type Reminder, type ReminderInput } from "@/lib/api";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const kinds: Record<string, string> = { OPEN_TASKS: "Offene Aufgaben", CHORE: "Bestimmte Aufgabe", MESSAGE: "Eigener Hinweis" };

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Das hat gerade nicht geklappt. Bitte erneut versuchen.";
}

export function MemberDevice({ member, devices, onSaved }: { member: ManagedMember; devices: Devices | null; onSaved: (service: string) => void }) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  async function change(service: string) {
    setPending(true);
    setStatus(null);
    try { await updateNotificationDevice(member.id, service); onSaved(service); setStatus("Handy gespeichert."); }
    catch (error) { setStatus(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function test() {
    setPending(true);
    try { await testNotificationDevice(member.id); setStatus("Testnachricht an Home Assistant übergeben."); }
    catch (error) { setStatus(errorMessage(error)); }
    finally { setPending(false); }
  }
  const known = devices?.devices.some((item) => item.service === member.notification_service);
  return <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
    <label className="block text-sm font-semibold">Handy für Erinnerungen<select aria-label={`Handy für ${member.display_name}`} disabled={pending || devices === null} value={member.notification_service} onChange={(event) => void change(event.target.value)} className="input mt-1">
      <option value="">Kein Handy</option>
      {member.notification_service && !known && <option value={member.notification_service}>{member.notification_service} (derzeit nicht verfügbar)</option>}
      {devices?.devices.map((device) => <option key={device.service} value={device.service}>{device.name}</option>)}
    </select></label>
    <button type="button" disabled={pending || !member.notification_service} onClick={() => void test()} className="button-secondary mt-2 text-xs">Testnachricht senden</button>
    {status && <p role="status" className="mt-2 text-xs">{status}</p>}
  </div>;
}

export function ReminderSettings({ members, chores }: { members: ManagedMember[]; chores: Chore[] }) {
  const empty = (): ReminderInput => ({ member_id: members[0]?.id ?? 0, kind: "OPEN_TASKS", chore_id: null, message: "", time: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true });
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [form, setForm] = useState<ReminderInput>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getReminders().then((items) => { if (active) setReminders(items); }).catch((error) => { if (active) setStatus(errorMessage(error)); });
    return () => { active = false; };
  }, []);

  async function refresh() { setReminders(await getReminders()); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.weekdays.length) { setStatus("Bitte mindestens einen Wochentag auswählen."); return; }
    setPending(true);
    setStatus(null);
    try { const saved = await saveReminder(editing, form); setReminders((items) => [...(items ?? []).filter((item) => item.id !== saved.id), saved].sort((a, b) => a.time.localeCompare(b.time))); setForm(empty()); setEditing(null); setStatus("Erinnerung gespeichert."); }
    catch (error) { setStatus(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function remove(reminder: Reminder) {
    setPending(true);
    try { await deleteReminder(reminder.id); setReminders((items) => items?.filter((item) => item.id !== reminder.id) ?? []); if (editing === reminder.id) { setEditing(null); setForm(empty()); } setStatus("Erinnerung gelöscht."); }
    catch (error) { setStatus(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function toggle(reminder: Reminder) {
    setPending(true);
    try { const updated = await saveReminder(reminder.id, { ...reminder, enabled: !reminder.enabled }); setReminders((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? []); }
    catch (error) { setStatus(errorMessage(error)); }
    finally { setPending(false); }
  }
  const selectedMember = members.find((member) => member.id === form.member_id);
  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Erinnerungen</h2><p className="mt-1 text-sm" style={{ color: "var(--color-subtle-text)" }}>Uhrzeiten gelten für Europe/Berlin. Das Handy wählst du beim Mitglied aus.</p></div><button type="button" className="button-secondary text-xs" onClick={() => void refresh().catch((error) => setStatus(errorMessage(error)))}>Status aktualisieren</button></div>
    {status && <p role="status" className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--color-border)" }}>{status}</p>}
    <div className="grid items-start gap-5 md:grid-cols-2">
      <div className="space-y-3">{reminders?.map((reminder) => <article key={reminder.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", opacity: reminder.enabled ? 1 : 0.65 }}>
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{members.find((member) => member.id === reminder.member_id)?.display_name} · {reminder.time.slice(0, 5)}</h3><button type="button" disabled={pending} aria-pressed={reminder.enabled} onClick={() => void toggle(reminder)} className="button-secondary text-xs">{reminder.enabled ? "Aktiv" : "Pausiert"}</button></div>
        <p className="mt-1 text-xs" style={{ color: "var(--color-subtle-text)" }}>{reminder.weekdays.map((day) => weekdays[day]).join(" · ")}</p>
        <p className="mt-2 text-sm">{reminder.kind === "CHORE" ? chores.find((chore) => chore.id === reminder.chore_id)?.title ?? "Aufgabe" : kinds[reminder.kind]}</p>
        {reminder.message && <p className="mt-1 whitespace-pre-wrap text-sm">{reminder.message}</p>}
        {!members.find((member) => member.id === reminder.member_id)?.notification_service && <p className="mt-2 text-xs" style={{ color: "var(--color-accent)" }}>Bitte beim Mitglied ein Handy auswählen.</p>}
        {reminder.last_sent_at && <p className="mt-2 text-[11px]" style={{ color: "var(--color-subtle-text)" }}>Zuletzt gesendet: {new Date(reminder.last_sent_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</p>}
        {reminder.last_error && <p className="mt-2 text-xs" style={{ color: "var(--color-destructive)" }}>{reminder.last_error}</p>}
        <div className="mt-3 flex gap-2"><button type="button" disabled={pending} onClick={() => { setEditing(reminder.id); setForm({ ...reminder, time: reminder.time.slice(0, 5) }); setStatus(null); }} className="button-secondary text-xs">Bearbeiten</button><button type="button" disabled={pending} onClick={() => void remove(reminder)} className="button-secondary text-xs">Löschen</button></div>
      </article>)}{reminders?.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-sm" style={{ borderColor: "var(--color-border)" }}>Noch keine Erinnerungen angelegt.</p>}{reminders === null && <p role="status">Erinnerungen werden geladen…</p>}</div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-xl font-semibold">{editing === null ? "Neue Erinnerung" : "Erinnerung bearbeiten"}</h3>
        <label className="block text-sm font-semibold">Für wen?<select required className="input mt-1" value={form.member_id} onChange={(event) => setForm({ ...form, member_id: Number(event.target.value) })}><option value={0} disabled>Mitglied auswählen</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>
        {selectedMember && !selectedMember.notification_service && <p className="text-xs" style={{ color: "var(--color-accent)" }}>Für {selectedMember.display_name} ist noch kein Handy ausgewählt.</p>}
        <label className="block text-sm font-semibold">Uhrzeit<input required type="time" className="input mt-1" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
        <fieldset><legend className="mb-2 text-sm font-semibold">Wochentage</legend><div className="flex flex-wrap gap-1">{weekdays.map((day, index) => <button key={day} type="button" aria-pressed={form.weekdays.includes(index)} onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(index) ? form.weekdays.filter((item) => item !== index) : [...form.weekdays, index].sort() })} className={`text-xs ${form.weekdays.includes(index) ? "button-primary" : "button-secondary"}`}>{day}</button>)}</div></fieldset>
        <label className="block text-sm font-semibold">Woran erinnern?<select className="input mt-1" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, chore_id: null })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {form.kind === "CHORE" && <label className="block text-sm font-semibold">Aufgabe<select required className="input mt-1" value={form.chore_id ?? ""} onChange={(event) => setForm({ ...form, chore_id: Number(event.target.value) })}><option value="" disabled>Aufgabe auswählen</option>{chores.map((chore) => <option key={chore.id} value={chore.id}>{chore.title}</option>)}</select></label>}
        <label className="block text-sm font-semibold">{form.kind === "MESSAGE" ? "Dein Hinweis" : "Zusätzlicher Hinweis (optional)"}<textarea required={form.kind === "MESSAGE"} maxLength={500} rows={3} className="input mt-1" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
        {form.kind !== "MESSAGE" && <p className="text-xs" style={{ color: "var(--color-subtle-text)" }}>Wird nur gesendet, wenn passende Aufgaben für diese Person aktuell offen sind.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />Erinnerung aktiv</label>
        <div className="flex gap-2"><button type="submit" disabled={pending || !form.member_id} className="button-primary">{pending ? "Speichert…" : "Speichern"}</button>{editing !== null && <button type="button" className="button-secondary" onClick={() => { setForm(empty()); setEditing(null); }}>Abbrechen</button>}</div>
      </form>
    </div>
  </section>;
}
