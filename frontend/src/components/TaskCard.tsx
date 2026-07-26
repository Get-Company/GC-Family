"use client";

import { AnimatePresence, motion } from "framer-motion";

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
  onComplete: (id: number) => void;
};

export function TaskCard({ instance, onComplete }: Props) {
  const done = instance.status === "DONE";

  return (
    <motion.li
      layout
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="flex items-center gap-4 rounded-2xl border p-4"
      style={{
        borderColor: "var(--color-border)",
        background: done ? "var(--color-muted)" : "var(--color-background)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {/* Aufgaben-Icon (Emoji als Inhalt, nicht als UI-Icon) */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{ backgroundColor: `${instance.color}1a` }}
        aria-hidden
      >
        {instance.icon || "✅"}
      </div>

      <div className="min-w-0 flex-1">
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
          {instance.assigned_member_name ?? "Niemand"}
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
      </div>

      {/* Abhaken-Button */}
      <motion.button
        type="button"
        onClick={() => !done && onComplete(instance.id)}
        disabled={done}
        aria-label={done ? "Erledigt" : `${instance.title} als erledigt markieren`}
        whileTap={{ scale: 0.9 }}
        className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2"
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
    </motion.li>
  );
}
