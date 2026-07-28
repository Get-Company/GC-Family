export type Inspiration = {
  text: string;
  author: string;
};

// 20 × 10 bewusst kurze, originale Familienimpulse. Die gemeinsame Autorin
// vermeidet falsche oder schwer überprüfbare Fremdzuschreibungen.
const STARTERS = [
  "Ein kleiner Schritt",
  "Mut",
  "Geduld",
  "Ein freundliches Wort",
  "Eine helfende Hand",
  "Neugier",
  "Ein offenes Ohr",
  "Zusammenhalt",
  "Ein neuer Anfang",
  "Ein ehrliches Lächeln",
  "Vertrauen",
  "Ein guter Plan",
  "Ausdauer",
  "Eine Pause",
  "Dankbarkeit",
  "Eine kluge Frage",
  "Verantwortung",
  "Ein gemeinsames Ziel",
  "Freude am Lernen",
  "Der Glaube an dich",
] as const;

const ENDINGS = [
  "verändert mehr, als man zuerst sieht.",
  "macht den nächsten Schritt leichter.",
  "wächst, wenn du ihm Raum gibst.",
  "kann einen ganzen Tag heller machen.",
  "zeigt Stärke ohne große Worte.",
  "findet oft den besten Weg nach vorn.",
  "macht aus einem Problem eine Aufgabe.",
  "macht aus vielen kleinen Dingen etwas Großes.",
  "beginnt genau in diesem Moment.",
  "steckt an und kommt oft zurück.",
] as const;

export const INSPIRATIONS: Inspiration[] = STARTERS.flatMap((starter) =>
  ENDINGS.map((ending) => ({ text: `${starter} ${ending}`, author: "GC-Family" })),
);

export function randomInspiration(): Inspiration {
  return INSPIRATIONS[Math.floor(Math.random() * INSPIRATIONS.length)]!;
}
