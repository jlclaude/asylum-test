import type { WheelOperatorState } from "./types";

type Props = {
  activeWheel: WheelOperatorState | null;
  muted: boolean;
  fullscreen: boolean;
  onToggleMuted: () => void;
  onToggleFullscreen: () => void;
};

export function GameModeToolbar({ activeWheel, muted, fullscreen, onToggleMuted, onToggleFullscreen }: Props) {
  return (
    <section className="studio-operator-toolbar" aria-label="Game Mode operator status">
      <dl>
        <div><dt>Active wheel</dt><dd>{activeWheel?.label ?? "No active target"}</dd></div>
        <div><dt>Status</dt><dd>{activeWheel?.status.replace("_", " ") ?? "COMPLETE"}</dd></div>
        <div><dt>Duration</dt><dd>{activeWheel?.selectedDuration ? `${activeWheel.selectedDuration} seconds` : "Not selected"}</dd></div>
        <div><dt>Sound</dt><dd>{muted ? "MUTED" : "ON"}</dd></div>
        <div><dt>Display</dt><dd>{fullscreen ? "FULLSCREEN" : "WINDOWED"}</dd></div>
      </dl>
      <div>
        <button type="button" aria-pressed={muted} aria-label={muted ? "Unmute wheel sounds" : "Mute wheel sounds"} onClick={onToggleMuted}>{muted ? "Sound Muted" : "Sound On"}</button>
        <button type="button" aria-pressed={fullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={onToggleFullscreen}>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
      </div>
    </section>
  );
}
