import { useEffect, useRef, type CSSProperties } from "react";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../../lib/asylum-themes";
import { AsylumLogo } from "../asylum/AsylumLogo";
import type { WheelEntry } from "./types";

type WheelCanvasProps = {
  entries: WheelEntry[];
  type: "NAME" | "VALUE";
  themeKey: AsylumThemeKey;
  rotation: number;
  spinning: boolean;
  duration: number | null;
  pointerTick: number;
  pointerIntensity: number;
  winnerEntryIndex?: number | null;
  celebrating?: boolean;
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

function drawWinnerHighlight(canvas: HTMLCanvasElement, entryCount: number, winnerEntryIndex: number) {
  const context = canvas.getContext("2d");
  if (!context || entryCount <= 0 || winnerEntryIndex < 0 || winnerEntryIndex >= entryCount) return;
  const center = canvas.width / 2;
  const radius = center - 35;
  const segmentAngle = (Math.PI * 2) / entryCount;
  const startAngle = winnerEntryIndex * segmentAngle - Math.PI / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.moveTo(center, center);
  context.arc(center, center, radius, startAngle, startAngle + segmentAngle);
  context.closePath();
  const glow = context.createRadialGradient(center, center, center * 0.2, center, center, radius);
  glow.addColorStop(0, "rgba(255,220,115,.08)");
  glow.addColorStop(0.55, "rgba(255,203,72,.25)");
  glow.addColorStop(1, "rgba(255,236,164,.72)");
  context.fillStyle = glow;
  context.shadowColor = "rgba(255,205,72,.9)";
  context.shadowBlur = 30;
  context.fill();
  context.restore();
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
      center,
      center,
      radius * 0.31,
      center,
      center,
      radius,
    );

    light.addColorStop(0, "rgba(255,255,255,.025)");
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

}

export function WheelCanvas({
  entries,
  type,
  themeKey,
  rotation,
  spinning,
  duration,
  pointerTick,
  pointerIntensity,
  winnerEntryIndex = null,
  celebrating = false,
}: WheelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const winnerCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    drawWheel(canvasRef.current, entries, type, themeKey);
  }, [entries, themeKey, type]);

  useEffect(() => {
    const canvas = winnerCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
    if (celebrating && winnerEntryIndex !== null) {
      drawWinnerHighlight(canvas, entries.length, winnerEntryIndex);
    }
  }, [celebrating, entries.length, winnerEntryIndex]);

  return (
    <div
      className={`studio-wheel-machine${spinning ? " studio-wheel-machine-spinning" : ""}${celebrating ? " studio-wheel-machine-celebrating" : ""}`}
    >
      <div className="studio-wheel-frame-inset" aria-hidden="true" />

      <div
        className={`studio-wheel-pointer${pointerTick > 0 ? " studio-wheel-pointer-recoil" : ""}`}
        aria-hidden="true"
        key={pointerTick}
        style={{
          "--pointer-recoil": `${2.5 + pointerIntensity * 4.5}px`,
          "--pointer-recoil-angle": `${3 + pointerIntensity * 5}deg`,
          "--pointer-recoil-duration": `${105 + pointerIntensity * 95}ms`,
        } as CSSProperties}
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

      <canvas
        ref={winnerCanvasRef}
        width={1200}
        height={1200}
        className="studio-wheel-winner-highlight"
        aria-hidden="true"
        style={{ transform: `rotate(${rotation}deg)` }}
      />

      <div className="studio-wheel-center-relief" aria-hidden="true" />

      <div className="studio-wheel-hub">
        <div className="studio-wheel-bearing" aria-hidden="true" />

        <div className="studio-wheel-hub-ring">
          <AsylumLogo decorative />
        </div>

        {spinning ? (
          <p>{duration ?? "—"} SEC</p>
        ) : null}
      </div>
    </div>
  );
}
