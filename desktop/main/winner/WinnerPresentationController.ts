import { BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

export type WinnerOverlayState = { visible: boolean; raffleCode: string | null; gameTitle: string | null; wheelLabel: string | null; wheelType: string | null; winnerDisplayName: string | null; rewardValue: string | null; secondChanceBefore: string | null; secondChanceAfter: string | null; revealedAt: string | null };
export type WinnerPresentationSettings = { enabled: boolean; confetti: boolean; sound: boolean; volume: number; overlayDelay: number; duration: number; audioFile: string | null };
export const DEFAULT_WINNER_PRESENTATION: WinnerPresentationSettings = { enabled: true, confetti: true, sound: true, volume: 0.7, overlayDelay: 500, duration: 4_000, audioFile: null };

export class WinnerPresentationController {
  private overlay: BrowserWindow | null = null;
  private last: { identity: string; state: WinnerOverlayState } | null = null;
  private handled = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly loadSettings: () => Promise<WinnerPresentationSettings>) {}

  async present(identity: string, state: WinnerOverlayState, force = false, sequenceDelay = 0, overrides: Partial<WinnerPresentationSettings> = {}) {
    if (!force && this.handled.has(identity)) return false;
    if (!force) this.handled.add(identity);
    this.last = { identity, state };
    const settings = { ...await this.loadSettings(), ...overrides };
    if (!settings.enabled && !force) return false;
    this.clearTimer();
    this.timer = setTimeout(() => void this.show(state, settings), settings.overlayDelay + sequenceDelay);
    return true;
  }
  replay() { return this.last ? this.present(this.last.identity, this.last.state, true) : Promise.resolve(false); }
  hide() { this.clearTimer(); this.overlay?.hide(); this.overlay?.webContents.send("winner:hide"); }
  reset() { this.hide(); this.last = null; }
  dispose() { this.clearTimer(); this.overlay?.destroy(); this.overlay = null; }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private async show(state: WinnerOverlayState, settings: WinnerPresentationSettings) {
    this.timer = null;
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new BrowserWindow({ width: 1280, height: 720, show: false, frame: false, transparent: true, resizable: true, title: "Asylum Winner Overlay", webPreferences: { preload: join(__dirname, "../../preload/winner-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      this.overlay.setMenuBarVisibility(false); this.overlay.setAlwaysOnTop(true, "floating");
      await this.overlay.loadFile(join(__dirname, "../../renderer/winner-overlay.html"));
    }
    let audioDataUrl: string | null = null;
    if (settings.sound && settings.audioFile) try { const data = await readFile(settings.audioFile); const ext = extname(settings.audioFile).toLowerCase(); const mime = ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg"; audioDataUrl = `data:${mime};base64,${data.toString("base64")}`; } catch { /* presentation remains visual */ }
    this.overlay.webContents.send("winner:show", { state: { ...state, visible: true }, effects: { confetti: settings.confetti, duration: settings.duration, sound: settings.sound, volume: settings.volume, audioDataUrl } });
    this.overlay.showInactive();
  }
}
