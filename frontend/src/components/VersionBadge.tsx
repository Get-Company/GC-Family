const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** Sichtbare, aus dem Git-Tag eingebackene Build-Version. */
export function VersionBadge() {
  return <span className="fixed bottom-3 right-3 z-50 rounded-full border px-3 py-1 text-xs font-bold shadow-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-button-surface)", color: "var(--color-foreground)", opacity: 0.86 }}>Version {version}</span>;
}
