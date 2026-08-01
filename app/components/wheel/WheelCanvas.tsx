import { useEffect, useRef } from "react";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../../lib/asylum-themes";
import type { WheelEntry } from "./types";

type WheelCanvasProps = {
  entries: WheelEntry[];
  type: "NAME" | "VALUE";
  themeKey: AsylumThemeKey;
  rotation: number;
  spinning: boolean;
  duration: number | null;
};

function entryLabel(entry: WheelEntry) {
  return "displayName" in entry ? entry.displayName : entry.value;
}

function drawWheel(
  canvas: HTMLCanvasElement,
  entries: WheelEntry[],
  type: "NAME" | "VALUE",
  themeKey: AsylumThemeKey,
) {
  const context = canvas.getContext("2d");

  if (!context || entries.length === 0) {
    return;
  }

  const theme = ASYLUM_THEMES[themeKey];
  const size = 1200;
  const center = size / 2;
  const radius = center - 24;
  const segmentAngle = (Math.PI * 2) / entries.length;

  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);

  entries.forEach((entry, index) => {
    const start = -Math.PI / 2 + index * segmentAngle;
    const end = start + segmentAngle;

    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();

    context.fillStyle =
      type === "VALUE"
        ? index % 2 === 0
          ? theme.valuePrimary
          : theme.valueDark
        : index % 2 === 0
          ? theme.primaryDark
          : theme.secondary;

    context.fill();

    const light = context.createLinearGradient(
      center - radius,
      center - radius,
      center + radius,
      center + radius,
    );

    light.addColorStop(0, "rgba(255,255,255,.13)");
    light.addColorStop(0.42, "rgba(255,255,255,0)");
    light.addColorStop(1, "rgba(0,0,0,.25)");

    context.fillStyle = light;
    context.fill();

    context.strokeStyle = theme.wheelDark;
    context.lineWidth = entries.length > 100 ? 1 : 2;
    context.stroke();

    if (type === "NAME" && entries.length > 90) {
      return;
    }

    context.save();
    context.translate(center, center);
    context.rotate(start + segmentAngle / 2);
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillStyle = theme.text;

    const fontSize =
      type === "VALUE"
        ? 31
        : entries.length > 60
          ? 15
          : entries.length > 35
            ? 19
            : 25;

    context.font = `900 ${fontSize}px Inter, Arial, sans-serif`;

    const rawLabel = entryLabel(entry);
    const label =
      rawLabel.length > 22
        ? `${rawLabel.slice(0, 21)}…`
        : rawLabel;

    context.fillText(label, radius - 42, 0);
    context.restore();
  });
}

export function WheelCanvas({
  entries,
  type,
  themeKey,
  rotation,
  spinning,
  duration,
}: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    drawWheel(canvasRef.current, entries, type, themeKey);
  }, [entries, themeKey, type]);

  return (
    <div className="studio-wheel-machine">
      <div className="studio-wheel-pointer" aria-hidden="true">
        <span />
      </div>

      <div className="studio-wheel-rivets" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <i
            key={index}
            style={{
              transform: `rotate(${index * 15}deg) translateY(-50%)`,
            }}
          />
        ))}
      </div>

      <canvas
        ref={canvasRef}
        className="studio-wheel-canvas"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      />

      <div className="studio-wheel-hub">
        <div className="studio-wheel-hub-ring">
          <strong>A</strong>
          <span>ASYLUM</span>
          <small>GAMES</small>
        </div>

        {spinning ? (
          <p>{duration ?? "—"} SEC</p>
        ) : null}
      </div>
    </div>
  );
}
