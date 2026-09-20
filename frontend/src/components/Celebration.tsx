import type { CSSProperties } from "react";

const colors = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#fb7185"];

const particles = Array.from({ length: 34 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 34 + ((index % 5) - 2) * 0.08;
  const distance = 16 + (index % 7) * 4;
  return {
    color: colors[index % colors.length],
    className: index % 3 === 0 ? "celebration-confetti-dot" : "",
    style: {
      "--confetti-x": `${Math.cos(angle) * distance}vw`,
      "--confetti-y": `${Math.sin(angle) * distance + 24}vh`,
      "--confetti-rotate": `${140 + (index % 6) * 80}deg`,
      "--confetti-delay": `${(index % 6) * 22}ms`,
    } as CSSProperties,
  };
});

/** Kurze, rein CSS-basierte Belohnung nach einer erfolgreich gespeicherten Aufgabe. */
export function Celebration() {
  return <>
    <p className="sr-only" role="status">Aufgabe erledigt. Super!</p>
    <div className="celebration-confetti" aria-hidden="true">
      <div className="celebration-glow" />
      {particles.map((particle, index) => <span key={index} className={particle.className} style={{ ...particle.style, backgroundColor: particle.color }} />)}
    </div>
  </>;
}
