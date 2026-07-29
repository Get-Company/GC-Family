"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

import type { Instance } from "@/lib/api";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Kleiner Partikel-Burst beim Erledigen (nur transform/opacity → GPU-freundlich).
function Burst({ color }: { color: string }) {
  const dots = Array.from({ length: 8 });
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dots.map((_, i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{
              opacity: 0,
              scale: 0.4,
              x: Math.cos(angle) * 34,
              y: Math.sin(angle) * 34,
            }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          />
        );
      })}
    </div>
  );
}

type Props = {
  instance: Instance;
  onComplete?: (id: number) => void;
  onShare?: (id: number) => void;
  onReopen?: (id: number) => void;
  onUndo?: (id: number) => void;
  canUndo?: boolean;
  showCompletionDetails?: boolean;
  readOnly?: boolean;
};

export function TaskCard({
  instance,
  onComplete,
  onShare,
  onReopen,
  onUndo,
  canUndo = false,
  showCompletionDetails = false,
  readOnly = false,
}: Props) {
  const done = instance.status === "DONE";
  const partial = instance.status === "PARTIAL";
  const canToggleDone = done && ((canUndo && Boolean(onUndo)) || Boolean(onReopen));
  const completedAt = instance.completed_at
    ? new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(instance.completed_at))
    : null;

  return (
    <motion.li
      layout
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: "var(--color-border)",
        background: done ? "var(--color-muted)" : "var(--color-background)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {instance.image_url && <Image src={instance.image_url} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized className="pointer-events-none object-cover opacity-[0.10]" />}
      {/* Aufgaben-Icon (Emoji als Inhalt, nicht als UI-Icon) */}
      <div
        className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl"
        style={{ backgroundColor: `${instance.color}1a` }}
        aria-hidden
      >
        {instance.icon || "✅"}
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <p
          className="truncate text-lg font-semibold transition-all"
          style={{
            fontFamily: "var(--font-heading)",
            textDecoration: done ? "line-through" : "none",
            opacity: done ? 0.55 : 1,
          }}
        >
          {instance.title}
        </p>
        <p className="text-sm" style={{ opacity: 0.7 }}>
          {instance.assigned_member_names.length > 0 ? instance.assigned_member_names.join(", ") : instance.assigned_member_name ?? "Frei für dich"}
          {instance.points > 0 && (
            <span
              className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                backgroundColor: `${instance.color}1a`,
                color: instance.color,
              }}
            >
              +{instance.points}
            </span>
          )}
        </p>
        {instance.active_until && (
          <p className="mt-1 text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
            Aktiv bis {new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${instance.active_until}T12:00:00`))}
          </p>
        )}
        {showCompletionDetails && done && instance.completed_by_name && (
          <p className="mt-1 text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
            Erledigt von {instance.completed_by_name}
            {completedAt ? ` · ${completedAt}` : ""}
          </p>
        )}
        {instance.contributions.length > 0 && (
          <p className="mt-1 text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
            {partial ? "Gemeinsam: " : "Erledigt: "}
            {instance.contributions.map((contribution) => `${contribution.member_emoji} ${contribution.member_name}${contribution.share === 0.5 ? " (½)" : ""}`).join(" · ")}
          </p>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 flex-col items-center gap-1">
        {/* Abhaken-Button */}
        <motion.button
          type="button"
          onClick={() => {
            if (readOnly || partial) return;
            if (done && canUndo && onUndo) {
              onUndo(instance.id);
              return;
            }
            if (done && onReopen) {
              onReopen(instance.id);
              return;
            }
            if (!done) onComplete?.(instance.id);
          }}
          disabled={partial || readOnly || (done && !canToggleDone)}
          aria-label={done ? canUndo ? `${instance.title}: meinen Anteil zurücknehmen` : "Aufgabe wieder öffnen" : partial ? "Wird gemeinsam erledigt" : `${instance.title} als erledigt markieren`}
          title={done ? canUndo ? "Zum Zurücknehmen erneut antippen" : "Zum Wiederöffnen erneut antippen" : "Als erledigt markieren"}
          whileTap={{ scale: 0.9 }}
          className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2"
          style={{
            borderColor: done ? "var(--color-secondary)" : "var(--color-border)",
            backgroundColor: done ? "var(--color-secondary)" : "transparent",
            ...({ "--tw-ring-color": "var(--color-ring)" } as React.CSSProperties),
          }}
        >
          <AnimatePresence>
            {done && (
              <>
                <Burst color="var(--color-secondary)" />
                <motion.svg
                  key="check"
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                >
                  <path d="M20 6 9 17l-5-5" />
                </motion.svg>
              </>
            )}
          </AnimatePresence>
        </motion.button>
        {!done && onShare && !readOnly && (
          <button type="button" onClick={() => onShare(instance.id)} className="touch-action inline-flex min-h-11 items-center justify-center gap-1.5 cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)", backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}>
            <ShareIcon />
            {partial ? "½ übernehmen" : "Teilen (½)"}
          </button>
        )}
      </div>
    </motion.li>
  );
}

function ShareIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h7a4 4 0 0 1 0 8h-1" /><path d="m10 4-3 3 3 3" /><path d="M17 17h-7a4 4 0 0 1 0-8h1" /><path d="m14 20 3-3-3-3" /></svg>;
}
