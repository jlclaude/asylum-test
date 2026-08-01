const shortcuts = [
  ["S", "Shuffle"], ["T", "Random Time"], ["Space", "Spin"],
  ["↑ / ↓", "Change Wheel"], ["F", "Fullscreen"], ["M", "Sound"], ["Esc", "Release Focus"],
];

export function GameModeShortcuts({ message }: { message: string | null }) {
  return (
    <aside className="studio-shortcut-panel" aria-label="Operator keyboard shortcuts">
      <h2>Operator shortcuts</h2>
      <dl>{shortcuts.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
      <p role="status" aria-live="polite">{message ?? "Keyboard control ready"}</p>
    </aside>
  );
}
