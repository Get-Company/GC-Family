"use client";

import Image from "next/image";
import { useState } from "react";
import type { BoardTask } from "@/lib/api";

type Props = {
  task: BoardTask;
  memberId: number | null;
  isParent: boolean;
  pending: boolean;
  onAction: (task: BoardTask, action: "complete" | "share" | "undo" | "reopen" | "always_complete" | "always_undo") => Promise<void>;
};

export function TaskTile({ task, memberId, isParent, pending, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const instance = task.instance;
  const alwaysAvailable = task.is_always_available;
  const ownShare = instance?.contributions.some((item) => item.member_id === memberId);
  const assigned = task.assigned_member_ids.length === 0 || (memberId !== null && task.assigned_member_ids.includes(memberId));
  const canComplete = alwaysAvailable ? task.available && assigned : task.available && assigned && !ownShare && instance?.status === "OPEN";
  const canShare = !alwaysAvailable && task.available && !ownShare && (assigned || instance?.status === "PARTIAL");
  const canUndoAlways = alwaysAvailable && task.latest_always_available_completion !== null && (isParent || task.latest_always_available_completion.member_id === memberId);
  const last = task.last_completion;
  const names = last?.contributions.map((item) => item.member_name).join(" & ") || last?.completed_by_name;
  const nextDate = task.next_available_on ? new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${task.next_available_on}T12:00:00`)) : null;
  const inactiveLabel = nextDate ? `Wieder ab ${nextDate}` : last ? "Abgeschlossen · kein weiterer Termin" : "Kein weiterer Termin";
  const alwaysAvailableAgain = task.always_available_again_at ? `Wieder erledigbar ab ${formatTimestamp(task.always_available_again_at)} Uhr` : null;

  return <li className={`task-tile ${task.available ? "" : "task-tile-inactive"}`}>
    {task.image_url && <Image src={task.image_url} alt="" fill sizes="(max-width: 640px) 50vw, 450px" unoptimized className="pointer-events-none object-cover opacity-[0.08]" />}
    <button type="button" className="relative flex w-full cursor-pointer flex-col items-start p-3 text-left sm:p-5" aria-expanded={expanded} aria-controls={`task-details-${task.id}`} onClick={() => setExpanded(!expanded)}>
      <span className="mb-3 flex w-full items-center justify-between gap-2"><span className="flex items-center gap-2"><span aria-hidden className="text-3xl">{task.icon || "☑️"}</span><AssigneeAvatars members={task.assigned_members} /></span><span className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: "var(--color-muted)", color: "var(--color-primary)" }}>{task.points} P</span></span>
      <span className="text-base font-semibold leading-snug [overflow-wrap:anywhere] sm:text-lg">{task.title}</span>
      <span className="mt-1 text-xs" style={{ color: "var(--color-subtle-text)" }}>{task.assigned_member_names.join(", ") || "Für alle"}</span>
      <span className="mt-3 flex w-full items-center justify-between gap-1 text-[11px] font-medium" style={{ color: task.available ? "var(--color-secondary)" : "var(--color-subtle-text)" }}><span>{alwaysAvailable ? task.available ? "Immer verfügbar" : "Gerade erledigt" : task.available ? instance?.status === "PARTIAL" ? "Noch ½ offen" : "Jetzt verfügbar" : instance?.status === "DONE" ? "Erledigt" : "Gerade inaktiv"}</span><svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg></span>
      {alwaysAvailable && <span className="mt-1 text-[10px] leading-snug" style={{ color: "var(--color-subtle-text)" }}>{task.completion_count_today ? `Heute ${task.completion_count_today}× erledigt${task.latest_always_available_completion ? ` · zuletzt ${task.latest_always_available_completion.member_name} um ${formatTimestamp(task.latest_always_available_completion.completed_at)}` : ""}` : "Heute noch nicht erledigt"}</span>}
      {!task.available && <span className="mt-1 text-[10px] leading-snug" style={{ color: "var(--color-subtle-text)" }}>{alwaysAvailable ? alwaysAvailableAgain : inactiveLabel}</span>}
      {!alwaysAvailable && names && <span className="mt-1 text-[10px] leading-snug" style={{ color: "var(--color-subtle-text)" }}>Erledigt: {names}{last?.completed_at ? ` · ${formatTimestamp(last.completed_at)}` : ""}</span>}
    </button>
    {expanded && <div id={`task-details-${task.id}`} className="task-details relative border-t p-3 sm:p-5" style={{ borderColor: "var(--color-border)" }}>
      <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{task.description || "Keine weiteren Hinweise. Du kannst direkt loslegen."}</p>
      {instance?.active_until && <p className="mt-2 text-[11px]" style={{ color: "var(--color-subtle-text)" }}>Zeitraum bis {new Date(`${instance.active_until}T12:00:00`).toLocaleDateString("de-DE")}</p>}
      {instance?.status === "PARTIAL" && <p className="mt-2 text-[11px]">{instance.contributions.map((item) => `${item.member_name}: ½ erledigt`).join(" · ")}</p>}
      {memberId === null ? <a href="#family-pin" className="button-secondary mt-3 w-full text-xs">Zum Erledigen anmelden</a> : <div className="mt-3 flex flex-col gap-2">
        {canComplete && <button type="button" disabled={pending} onClick={() => void onAction(task, alwaysAvailable ? "always_complete" : "complete")} className="button-primary button-complete text-sm"><span className="complete-button-check" aria-hidden="true">✓</span><span>{pending ? "Speichert…" : alwaysAvailable && task.completion_count_today ? "Erneut erledigen" : "Erledigen"}</span><span className="complete-button-sparkle" aria-hidden="true">✦</span></button>}
        {canShare && <button type="button" disabled={pending} onClick={() => void onAction(task, "share")} className="button-secondary text-xs">½ übernehmen</button>}
        {canUndoAlways && <button type="button" disabled={pending} onClick={() => void onAction(task, "always_undo")} className="button-secondary text-xs">Letzte Erledigung zurücknehmen</button>}
        {ownShare && <button type="button" disabled={pending} onClick={() => void onAction(task, "undo")} className="button-secondary text-xs">Meinen Anteil zurücknehmen</button>}
        {!ownShare && isParent && instance?.status === "DONE" && <button type="button" disabled={pending} onClick={() => void onAction(task, "reopen")} className="button-secondary text-xs">Wieder öffnen</button>}
        {!alwaysAvailable && task.available && !canShare && !ownShare && <p className="text-[11px]" style={{ color: "var(--color-subtle-text)" }}>Diese Aufgabe ist {task.assigned_member_names.join(" und ")} zugewiesen.</p>}
      </div>}
    </div>}
  </li>;
}

function AssigneeAvatars({ members }: { members: BoardTask["assigned_members"] }) {
  if (members.length === 0) return null;

  return <span role="img" aria-label={`Zugewiesen an ${members.map((member) => member.display_name).join(", ")}`} className="flex items-center">
    {members.map((member) => <span key={member.id} title={member.display_name} aria-hidden className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold text-white first:ml-0" style={{ backgroundColor: member.color, borderColor: "var(--color-background)" }}>{member.emoji || member.display_name.trim().charAt(0).toUpperCase()}</span>)}
  </span>;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value));
}
