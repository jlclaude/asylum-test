import type { WheelData } from "../wheel/types";
import { broadcastWheelStatus } from "../../lib/game-mode-operator";

type Props = {
  wheel: WheelData;
  active: boolean;
  onSelect: (id: string) => void;
};

export function BroadcastWheelCard({ wheel, active, onSelect }: Props) {
  const result = wheel.winnerDisplayName ?? wheel.winnerValue;
  const status = broadcastWheelStatus(wheel);

  return (
    <button
      className={`broadcast-wheel-card${active ? " broadcast-wheel-card-active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(wheel.id)}
    >
      <span>{wheel.type} WHEEL</span>
      <strong>{wheel.label}</strong>
      <dl>
        <div><dt>Status</dt><dd>{status}</dd></div>
        <div><dt>Entries</dt><dd>{wheel.entries.length}</dd></div>
        <div><dt>Duration</dt><dd>{wheel.spinDurationSeconds ? `${wheel.spinDurationSeconds}s` : "—"}</dd></div>
        <div><dt>Result</dt><dd>{result ?? "PENDING"}</dd></div>
      </dl>
    </button>
  );
}
