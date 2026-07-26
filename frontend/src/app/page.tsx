"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { apiGet, type Health } from "@/lib/api";

type BackendState =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<BackendState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    apiGet<Health>("/health")
      .then((health) => active && setState({ kind: "ok", health }))
      .catch((err) => active && setState({ kind: "error", message: String(err) }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-4xl font-bold sm:text-5xl"
      >
        GC-Family
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-lg text-gray-500"
      >
        Haushaltsaufgaben für die ganze Familie
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="rounded-2xl border border-gray-200 px-6 py-4 text-sm shadow-sm dark:border-gray-700"
      >
        <span className="text-gray-500">Backend-Status: </span>
        {state.kind === "loading" && <span>lädt…</span>}
        {state.kind === "ok" && (
          <span className="font-semibold text-green-600">
            ● {state.health.status} ({state.health.service})
          </span>
        )}
        {state.kind === "error" && (
          <span className="font-semibold text-red-600">● nicht erreichbar</span>
        )}
      </motion.div>
    </main>
  );
}
