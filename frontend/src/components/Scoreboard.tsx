"use client";

import { useState } from "react";
import type { MemberWeeklyStats, ScoreboardData } from "@/lib/api";

const periods = [
  { key: "week", label: "Wochensieger", short: "Woche", hint: "Aktuelle Woche · ab Sonntag" },
  { key: "month", label: "Monatssieger", short: "Monat", hint: "Aktueller Kalendermonat" },
  { key: "all_time", label: "All-Time Winner", short: "All-Time", hint: "Seit dem ersten Punkt" },
] as const;

function ranking(stats: MemberWeeklyStats[]) {
  return stats.filter((item) => item.points > 0).sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name, "de"));
}

export function Scoreboard({ data }: { data: ScoreboardData }) {
  const [period, setPeriod] = useState<keyof ScoreboardData>("week");
  const ranked = ranking(data[period]);
  return <section>
    <div className="grid gap-3 sm:grid-cols-3">
      {periods.map(({ key, label, hint }) => {
        const stats = ranking(data[key]);
        const winners = stats.filter((item) => item.points === stats[0]?.points);
        return <article key={key} className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>{label}</p>
          <h2 className="mt-3 text-xl font-semibold">{winners.length ? winners.map((item) => `${item.emoji} ${item.display_name}`).join(" & ") : "Noch offen"}</h2>
          <p className="mt-1 font-bold" style={{ color: "var(--color-primary)" }}>{stats[0] ? `${number(stats[0].points)} Punkte` : "Die ersten Punkte zählen!"}</p>
          <p className="mt-3 text-[11px]" style={{ color: "var(--color-subtle-text)" }}>{hint}{winners.length > 1 ? " · Gleichstand" : ""}</p>
        </article>;
      })}
    </div>
    <div className="mt-6 flex gap-2" role="group" aria-label="Zeitraum der Rangliste">{periods.map(({ key, short }) => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)} className={period === key ? "button-primary" : "button-secondary"}>{short}</button>)}</div>
    <p className="mt-3 text-xs" style={{ color: "var(--color-subtle-text)" }}>Punkte zählen am Tag der Erledigung. Gemeinsame Aufgaben enthalten den Team-Bonus.</p>
    <ol className="mt-4 space-y-2">{ranked.map((item, index) => <li key={item.member_id} className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}><span className="w-6 font-bold" style={{ color: "var(--color-accent)" }}>{ranked.findIndex((stat) => stat.points === item.points) + 1}</span><span aria-hidden>{item.emoji}</span><span className="min-w-0 flex-1 font-semibold">{item.display_name}{index === 0 && <span className="sr-only">, führt die Rangliste an</span>}</span><span className="text-xs" style={{ color: "var(--color-subtle-text)" }}>{number(item.completed_tasks)} Aufgaben</span><span className="font-bold">{number(item.points)} P</span></li>)}</ol>
    {ranked.length === 0 && <p className="mt-4 rounded-2xl border border-dashed p-6 text-center" style={{ borderColor: "var(--color-border)" }}>In diesem Zeitraum wurden noch keine Punkte gesammelt.</p>}
  </section>;
}

function number(value: number) { return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value); }
