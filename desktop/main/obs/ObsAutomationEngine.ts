import type { ObsController } from "./ObsController";
import type { ObsSettingsStore } from "./obs-settings";
import type { ObsMappingKey, ObsSceneMappings, ObsTimer } from "./obs-types";

export type ObsAutomationEvent = "SPIN" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "ACCEPT_RESULT" | "RAFFLE_FINISHED";
export type ObsAutomationMode = "WAITING" | "WHEEL" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "HOST" | "ENDING";
export type ObsAutomationStatus = { mode: ObsAutomationMode; pending: ObsAutomationMode | null; log: Array<{ at: string; mode: ObsAutomationMode; sceneName: string; message: string }> };

const defaultTimer: ObsTimer = { set: (callback, delay) => setTimeout(callback, delay), clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };

export class ObsAutomationEngine {
  private status: ObsAutomationStatus = { mode: "WAITING", pending: null, log: [] };
  private timer: unknown = null;
  private queued: { mode: ObsAutomationMode; sceneName: string; delay: number } | null = null;
  private subscribers = new Set<(status: ObsAutomationStatus) => void>();

  constructor(private readonly controller: Pick<ObsController, "getState" | "getScenes" | "switchScene">, private readonly settings: Pick<ObsSettingsStore, "loadSceneMappings">, private readonly timerApi: ObsTimer = defaultTimer) {}

  getStatus(): ObsAutomationStatus { return { ...this.status, log: this.status.log.map((entry) => ({ ...entry })) }; }
  subscribe(callback: (status: ObsAutomationStatus) => void) { this.subscribers.add(callback); callback(this.getStatus()); return () => this.subscribers.delete(callback); }

  async handle(event: ObsAutomationEvent): Promise<void> {
    const settings = await this.settings.loadSceneMappings();
    if (!settings.automation.enabled) { this.cancelPending(); this.patch({ mode: "WAITING", pending: null }); return; }
    const target = this.target(event, settings);
    if (event === "SECOND_CHANCE" && this.timer && this.status.pending === "WINNER" && target?.enabled && target.sceneName) {
      this.queued = { mode: target.mode, sceneName: target.sceneName, delay: target.delay };
      return;
    }
    this.cancelPending();
    if (!target || !target.enabled || !target.sceneName) {
      // A missing Second Chance mapping deliberately leaves OBS (and the
      // displayed automation state) on the Winner scene.
      if (event !== "SECOND_CHANCE") this.patch({ mode: "WAITING", pending: null });
      return;
    }
    if (this.controller.getState().connection !== "CONNECTED") { this.addLog(target.mode, target.sceneName, "OBS unavailable"); return; }
    this.patch({ pending: target.mode });
    const run = () => { this.timer = null; void this.execute(target.mode, target.sceneName!); };
    if (target.delay === 0) run(); else this.timer = this.timerApi.set(run, target.delay);
  }

  dispose() { this.cancelPending(); this.subscribers.clear(); }
  markUnavailable() { this.cancelPending(); this.patch({ mode: "WAITING", pending: null }); }

  private target(event: ObsAutomationEvent, settings: ObsSceneMappings): { mode: ObsAutomationMode; mapping: ObsMappingKey; sceneName: string | null; enabled: boolean; delay: number } | null {
    const targets = {
      SPIN: ["WHEEL", "wheel", settings.automation.spinToWheel, settings.delays.wheel],
      WINNER: ["WINNER", "winner", settings.automation.revealToWinner, settings.delays.winner],
      SECOND_CHANCE: ["SECOND_CHANCE", "secondChance", settings.automation.secondChance, settings.delays.secondChance],
      REWARD: ["REWARD", "reward", settings.automation.reward, settings.delays.reward],
      ACCEPT_RESULT: ["HOST", "host", settings.automation.acceptToHost, settings.delays.host],
      RAFFLE_FINISHED: ["ENDING", "ending", settings.automation.finishToEnding, 0],
    } as const;
    const value = targets[event]; if (!value) return null;
    return { mode: value[0], mapping: value[1], enabled: value[2], delay: value[3], sceneName: settings.scenes[value[1]] };
  }

  private async execute(mode: ObsAutomationMode, sceneName: string) {
    if (this.controller.getState().connection !== "CONNECTED") { this.addLog(mode, sceneName, "OBS unavailable"); return; }
    if (!this.controller.getScenes().includes(sceneName)) { this.addLog(mode, sceneName, "Mapped scene unavailable"); return; }
    try {
      if (this.controller.getState().currentScene !== sceneName) await this.controller.switchScene(sceneName);
      this.patch({ mode, pending: null }); this.addLog(mode, sceneName, `${this.label(mode)} Scene`);
      this.runQueued();
    }
    catch { this.addLog(mode, sceneName, "OBS unavailable"); }
  }

  private label(mode: ObsAutomationMode) { return mode === "SECOND_CHANCE" ? "Second Chance" : mode[0] + mode.slice(1).toLowerCase(); }
  private runQueued() { const target = this.queued; this.queued = null; if (!target) return; this.patch({ pending: target.mode }); const run = () => { this.timer = null; void this.execute(target.mode, target.sceneName); }; if (target.delay === 0) run(); else this.timer = this.timerApi.set(run, target.delay); }
  private cancelPending() { if (this.timer) this.timerApi.clear(this.timer); this.timer = null; this.queued = null; this.patch({ pending: null }); }
  private addLog(mode: ObsAutomationMode, sceneName: string, message: string) { this.status = { ...this.status, pending: null, log: [{ at: new Date().toISOString(), mode, sceneName, message }, ...this.status.log].slice(0, 100) }; this.emit(); }
  private patch(update: Partial<ObsAutomationStatus>) { this.status = { ...this.status, ...update }; this.emit(); }
  private emit() { const snapshot = this.getStatus(); for (const subscriber of this.subscribers) subscriber(snapshot); }
}
