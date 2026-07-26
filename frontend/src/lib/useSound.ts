"use client";

import { useCallback, useRef, useState } from "react";

// Akustisches Feedback per Web Audio API — kleine synthetisierte Klänge,
// damit keine Audiodateien nötig sind. Der AudioContext wird erst bei der
// ersten Nutzer-Interaktion erzeugt/aufgeweckt (Browser-Autoplay-Regeln).

type SoundName = "success" | "click" | "error";

const MUTE_KEY = "gcfamily:muted";

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.18,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  // Weiche Hüllkurve: schnell an, sanft aus.
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ctx.currentTime + start + duration,
  );
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1",
  );

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (muted) return;
      const ctx = ensureCtx();
      if (!ctx) return;

      if (name === "success") {
        // Fröhlicher, aufsteigender Dreiklang (C5 – E5 – G5).
        playTone(ctx, 523.25, 0, 0.16, "triangle");
        playTone(ctx, 659.25, 0.09, 0.16, "triangle");
        playTone(ctx, 783.99, 0.18, 0.28, "triangle", 0.22);
      } else if (name === "click") {
        playTone(ctx, 440, 0, 0.07, "sine", 0.12);
      } else if (name === "error") {
        playTone(ctx, 220, 0, 0.22, "sawtooth", 0.12);
      }
    },
    [muted, ensureCtx],
  );

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return { play, muted, toggleMuted };
}
