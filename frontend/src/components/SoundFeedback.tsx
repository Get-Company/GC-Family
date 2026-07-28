"use client";

import { useEffect } from "react";

import { useSound } from "@/lib/useSound";

/** Ergänzt positiven/negativen Fachklang um einen leisen neutralen UI-Klick. */
export function SoundFeedback() {
  const { play } = useSound();

  useEffect(() => {
    const onPointerUp = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("button, a, select, summary")) {
        play("click");
      }
    };
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [play]);

  return null;
}
