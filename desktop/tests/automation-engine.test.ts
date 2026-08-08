import assert from "node:assert/strict";
import { ObsAutomationEngine, type ObsAutomationEvent } from "../main/obs/ObsAutomationEngine";
import type { ObsSceneMappings, ObsTimer } from "../main/obs/obs-types";

const mappings: ObsSceneMappings = {
  scenes: { host: "Host", wheel: "Wheel", winner: "Winner", secondChance: "Second", reward: "Reward", break: null, ending: "Ending" },
  automation: { spinToWheel: true, revealToWinner: true, secondChance: true, reward: true, acceptToHost: true, finishToEnding: true },
  delays: { wheel: 0, winner: 1_000, secondChance: 1_000, reward: 1_000, host: 3_000 },
};
class Timer implements ObsTimer {
  pending: Array<{ callback: () => void; delay: number }> = [];
  set(callback: () => void, delay: number) { const value = { callback, delay }; this.pending.push(value); return value; }
  clear(timer: unknown) { this.pending = this.pending.filter((value) => value !== timer); }
  run() { this.pending.shift()?.callback(); }
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }
async function run() {
  const switched: string[] = []; let connected = true; const timer = new Timer();
  const controller = { getState: () => ({ connection: connected ? "CONNECTED" : "DISCONNECTED" }), getScenes: () => ["Host", "Wheel", "Winner", "Second", "Reward", "Ending"], switchScene: async (scene: unknown) => { switched.push(String(scene)); return {} as never; } };
  const engine = new ObsAutomationEngine(controller as never, { loadSceneMappings: async () => mappings }, timer);
  await engine.handle("SPIN"); await flush(); assert.equal(switched.at(-1), "Wheel");
  for (const [event, scene, delay] of [["WINNER", "Winner", 1_000], ["SECOND_CHANCE", "Second", 1_000], ["REWARD", "Reward", 1_000], ["ACCEPT_RESULT", "Host", 3_000]] as Array<[ObsAutomationEvent, string, number]>) {
    await engine.handle(event); assert.equal(timer.pending[0]?.delay, delay); timer.run(); await flush(); assert.equal(switched.at(-1), scene);
  }
  await engine.handle("ACCEPT_RESULT"); assert.equal(timer.pending.length, 1); await engine.handle("SPIN"); await flush(); assert.equal(timer.pending.length, 0); assert.equal(switched.at(-1), "Wheel");
  connected = false; const before = switched.length; await engine.handle("WINNER"); assert.equal(switched.length, before); assert.equal(engine.getStatus().log[0]?.message, "OBS unavailable");
  connected = true; await engine.handle("RAFFLE_FINISHED"); await flush(); assert.equal(switched.at(-1), "Ending");
  engine.dispose(); console.info("OBS automation engine tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
