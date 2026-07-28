"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TaskCard } from "@/components/TaskCard";
import { getInstances, type Instance } from "@/lib/api";
import { useAuth } from "@/lib/AuthProvider";

export default function HistoryPage() {
  const router = useRouter();
  const { state } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (state.kind === "anonymous") {
      router.replace("/login");
      return;
    }
    if (state.kind !== "authenticated") {
      return;
    }
    const previousWeekEnd = new Date();
    previousWeekEnd.setHours(12, 0, 0, 0);
    previousWeekEnd.setDate(previousWeekEnd.getDate() - previousWeekEnd.getDay() - 1);
    void getInstances("2000-01-01", toIsoDate(previousWeekEnd))
      .then(setInstances)
      .catch(() => setError(true));
  }, [router, state.kind]);

  if (state.kind !== "authenticated") {
    return <main className="flex flex-1 items-center justify-center">Lädt…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>Elternbereich</p>
          <h1 className="text-4xl font-bold">Wochenverlauf</h1>
          <p className="mt-1 text-sm" style={{ opacity: 0.7 }}>Abgeschlossene Wochen sind nur für Eltern einsehbar.</p>
        </div>
        <Link href="/" className="cursor-pointer rounded-xl border px-4 py-2 font-bold" style={{ borderColor: "var(--color-border)" }}>Dashboard</Link>
      </header>
      {error ? <p style={{ color: "var(--color-destructive)" }}>Der Verlauf konnte nicht geladen werden.</p> : instances.length === 0 ? <p style={{ opacity: 0.7 }}>Es gibt noch keine Aufgaben aus vergangenen Wochen.</p> : <ul className="space-y-3">{instances.map((instance) => <TaskCard key={instance.id} instance={instance} showCompletionDetails readOnly />)}</ul>}
    </main>
  );
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
