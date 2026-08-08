import { app } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DESKTOP_ZOOM_PRESETS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export type DesktopWorkspace = "host" | "facebook" | "broadcast" | "studio";
export type DesktopZoomSettings = Record<DesktopWorkspace, number>;
export const DEFAULT_DESKTOP_ZOOM: DesktopZoomSettings = { host: 1, facebook: 1, broadcast: 1, studio: 1 };

export function validDesktopWorkspace(value: unknown): value is DesktopWorkspace { return ["host", "facebook", "broadcast", "studio"].includes(String(value)); }
export function normalizeZoom(value: unknown) { const numeric = Number(value); return DESKTOP_ZOOM_PRESETS.find((preset) => preset === numeric) ?? 1; }
export function adjacentZoom(value: number, direction: 1 | -1) {
  const index = DESKTOP_ZOOM_PRESETS.indexOf(normalizeZoom(value) as typeof DESKTOP_ZOOM_PRESETS[number]);
  return DESKTOP_ZOOM_PRESETS[Math.max(0, Math.min(DESKTOP_ZOOM_PRESETS.length - 1, index + direction))];
}

export class DesktopZoomStore {
  constructor(private readonly path = join(app.getPath("userData"), "desktop-zoom.json")) {}
  async load(): Promise<DesktopZoomSettings> {
    try {
      const stored = JSON.parse(await readFile(this.path, "utf8")) as Partial<DesktopZoomSettings>;
      return { host: normalizeZoom(stored.host), facebook: normalizeZoom(stored.facebook), broadcast: normalizeZoom(stored.broadcast), studio: normalizeZoom(stored.studio) };
    } catch { return { ...DEFAULT_DESKTOP_ZOOM }; }
  }
  async save(settings: DesktopZoomSettings) { await writeFile(this.path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 }); }
}
