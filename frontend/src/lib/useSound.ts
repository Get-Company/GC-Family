"use client";

import { useCallback, useRef, useState } from "react";

// Akustisches Feedback per Web Audio API — kleine synthetisierte Klänge,
// damit keine Audiodateien nötig sind. Der AudioContext wird erst bei der
// ersten Nutzer-Interaktion erzeugt/aufgeweckt (Browser-Autoplay-Regeln).

type SoundName = "success" | "click" | "error";
export type JingleName = "SPARKLE" | "BELL" | "FANFARE" | "BUBBLE" | "CELEBRATE" | "SOFT" | "DOWNBEAT" | "RAIN" | "PLOP" | "RESET";

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

  const playJingle = useCallback((jingle: string, fallback: SoundName = "success") => {
    if (muted) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    // Alle Varianten bleiben absichtlich deutlich unter drei Sekunden.
    if (jingle === "BELL") {
      playTone(ctx, 659.25, 0, 0.22, "sine", 0.18);
      playTone(ctx, 880, 0.16, 0.42, "sine", 0.16);
    } else if (jingle === "FANFARE") {
      playTone(ctx, 392, 0, 0.14, "triangle");
      playTone(ctx, 523.25, 0.14, 0.14, "triangle");
      playTone(ctx, 783.99, 0.28, 0.5, "triangle", 0.22);
    } else if (jingle === "BUBBLE") {
      playTone(ctx, 330, 0, 0.1, "sine", 0.13);
      playTone(ctx, 440, 0.12, 0.12, "sine", 0.14);
      playTone(ctx, 620, 0.26, 0.18, "sine", 0.14);
    } else if (jingle === "CELEBRATE") {
      playTone(ctx, 523.25, 0, 0.16, "triangle", 0.17);
      playTone(ctx, 659.25, 0.1, 0.16, "triangle", 0.18);
      playTone(ctx, 783.99, 0.2, 0.2, "triangle", 0.2);
      playTone(ctx, 1046.5, 0.3, 0.5, "triangle", 0.22);
    } else if (jingle === "SOFT") {
      playTone(ctx, 392, 0, 0.2, "sine", 0.1);
      playTone(ctx, 330, 0.13, 0.3, "sine", 0.08);
    } else if (jingle === "DOWNBEAT") {
      playTone(ctx, 349.23, 0, 0.18, "triangle", 0.12);
      playTone(ctx, 261.63, 0.15, 0.42, "triangle", 0.12);
    } else if (jingle === "RAIN") {
      playTone(ctx, 740, 0, 0.08, "sine", 0.08);
      playTone(ctx, 620, 0.11, 0.08, "sine", 0.08);
      playTone(ctx, 520, 0.22, 0.18, "sine", 0.08);
    } else if (jingle === "PLOP") {
      playTone(ctx, 260, 0, 0.12, "sine", 0.14);
      playTone(ctx, 190, 0.1, 0.22, "sine", 0.12);
    } else if (jingle === "RESET") {
      playTone(ctx, 440, 0, 0.1, "sine", 0.1);
      playTone(ctx, 330, 0.12, 0.1, "sine", 0.09);
      playTone(ctx, 440, 0.25, 0.24, "sine", 0.11);
    } else if (jingle === "SPARKLE") {
      playTone(ctx, 659.25, 0, 0.12, "triangle", 0.16);
      playTone(ctx, 880, 0.09, 0.12, "triangle", 0.18);
      playTone(ctx, 1046.5, 0.18, 0.32, "triangle", 0.2);
    } else {
      play(fallback);
    }
  }, [ensureCtx, muted, play]);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return { play, playJingle, muted, toggleMuted };
}
