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
  pointerTick: number;
};

function entryLabel(entry: WheelEntry) {
  return "displayName" in entry ? entry.displayName : entry.value;
}

function segmentCenterPosition(index: number, segmentCount: number) {
  const segmentAngle = (Math.PI * 2) / segmentCount;
  const startAngle = index * segmentAngle - Math.PI / 2;
  const centerAngle = startAngle + segmentAngle / 2;
  const centerX = 50;
  const centerY = 50;
  const dotRadius = 46;

  return {
    x: centerX + Math.cos(centerAngle) * dotRadius,
    y: centerY + Math.sin(centerAngle) * dotRadius,
  };
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

    const light = context.createRadialGradient(
      center * 0.78,
      center * 0.72,
      radius * 0.08,
      center,
      center,
      radius,
    );

    light.addColorStop(0, "rgba(255,255,255,.2)");
    light.addColorStop(0.46, "rgba(255,255,255,.025)");
    light.addColorStop(0.84, "rgba(0,0,0,.2)");
    light.addColorStop(1, "rgba(0,0,0,.48)");

    context.fillStyle = light;
    context.fill();

    context.strokeStyle = "rgba(5,5,7,.72)";
    context.lineWidth = entries.length > 100 ? 1 : 2.5;
    context.stroke();

    if (entries.length > 96) {
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
        : entries.length > 72
          ? 13
          : entries.length > 52
            ? 16
            : entries.length > 32
              ? 20
              : 26;

    context.font = `900 ${fontSize}px Inter, Arial, sans-serif`;

    const rawLabel = entryLabel(entry);
    const label =
      rawLabel.length > (entries.length > 52 ? 12 : 22)
        ? `${rawLabel.slice(0, entries.length > 52 ? 11 : 21)}…`
        : rawLabel;

    context.shadowColor = "rgba(0,0,0,.8)";
    context.shadowBlur = 5;
    context.fillText(label, radius - 46, 0);
    context.restore();
  });

  context.beginPath();
  context.arc(center, center, radius - 5, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255,255,255,.18)";
  context.lineWidth = 5;
  context.stroke();

  context.beginPath();
  context.arc(center, center, radius * 0.29, 0, Math.PI * 2);
  context.strokeStyle = "rgba(0,0,0,.42)";
  context.lineWidth = 9;
  context.stroke();
}

export function WheelCanvas({
  entries,
  type,
  themeKey,
  rotation,
  spinning,
  duration,
  pointerTick,
}: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    drawWheel(canvasRef.current, entries, type, themeKey);
  }, [entries, themeKey, type]);

  return (
    <div
      className={`studio-wheel-machine${spinning ? " studio-wheel-machine-spinning" : ""}`}
    >
      <div className="studio-wheel-frame-inset" aria-hidden="true" />

      <div
        className={`studio-wheel-pointer${pointerTick > 0 ? " studio-wheel-pointer-recoil" : ""}`}
        aria-hidden="true"
        key={pointerTick}
      >
        <i />
        <span />
      </div>

      <div
        className="studio-wheel-rivets"
        aria-hidden="true"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {entries.map((_, index) => {
          const position = segmentCenterPosition(index, entries.length);

          return (
            <i
              key={index}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
              }}
            />
          );
        })}
      </div>

      <canvas
        ref={canvasRef}
        className="studio-wheel-canvas"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      />

      <div className="studio-wheel-hub">
        <div className="studio-wheel-bearing" aria-hidden="true" />

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
