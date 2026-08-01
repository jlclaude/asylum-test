import type { WheelData } from "../wheel/types";
import { BroadcastWheelCard } from "./BroadcastWheelCard";

export function BroadcastWheelRail({ wheels, activeId, onSelect }: {
  wheels: WheelData[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="broadcast-wheel-rail" aria-label="Game wheels">
      {wheels.map((wheel) => (
        <BroadcastWheelCard key={wheel.id} wheel={wheel} active={wheel.id === activeId} onSelect={onSelect} />
      ))}
    </nav>
  );
}
