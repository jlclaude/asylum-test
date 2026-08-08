import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ObsController } from "../main/obs/ObsController";
import { obsWebSocketUrl, validateObsConfig, validateSceneName } from "../main/obs/obs-validation";
import type { ObsClient, ObsTimer } from "../main/obs/obs-types";

class FakeObs implements ObsClient {
  handlers = new Map<string, (event?: unknown) => void>();
  calls: string[] = [];
  stream = false; recording = false; current = "Main";
  async connect(url: string, password?: string) { this.calls.push(`connect:${url}:${password ?? ""}`); }
  async disconnect() { this.calls.push("disconnect"); }
  on(event: string, handler: (event?: unknown) => void) { this.handlers.set(event, handler); }
  async call(type: string, data?: Record<string, unknown>): Promise<unknown> {
    this.calls.push(type);
    if (type === "GetSceneList") return { currentProgramSceneName: this.current, scenes: [{ sceneName: "Main" }, { sceneName: "Break" }] };
    if (type === "GetStreamStatus") return { outputActive: this.stream, outputDuration: 0 };
    if (type === "GetRecordStatus") return { outputActive: this.recording };
    if (type === "SetCurrentProgramScene") this.current = String(data?.sceneName);
    if (type === "StartStream") this.stream = true; if (type === "StopStream") this.stream = false;
    if (type === "StartRecord") this.recording = true; if (type === "StopRecord") this.recording = false;
    return {};
  }
  emit(event: string, data?: unknown) { this.handlers.get(event)?.(data); }
}

class FakeTimer implements ObsTimer {
  pending: Array<{ callback: () => void; delay: number }> = [];
  cleared = 0;
  set(callback: () => void, delay: number) { const timer = { callback, delay }; this.pending.push(timer); return timer; }
  clear(timer: unknown) { this.pending = this.pending.filter((entry) => entry !== timer); this.cleared += 1; }
}

async function run() {
  assert.deepEqual(validateObsConfig({ host: "localhost", port: 4455 }), { host: "localhost", port: 4455 });
  assert.deepEqual(validateObsConfig({ host: "127.0.0.1", port: 4455 }), { host: "127.0.0.1", port: 4455 });
  assert.deepEqual(validateObsConfig({ host: "::1", port: 4455 }), { host: "::1", port: 4455 });
  assert.throws(() => validateObsConfig({ host: "192.168.1.2", port: 4455 }), /this computer/);
  assert.throws(() => validateObsConfig(null), /invalid/);
  assert.throws(() => validateObsConfig({ host: "localhost", port: "oops" }), /port/);
  assert.throws(() => validateObsConfig({ host: "localhost", port: 70000 }), /port/);
  assert.equal(obsWebSocketUrl({ host: "::1", port: 4455 }), "ws://[::1]:4455");
  assert.throws(() => validateSceneName(""), /scene/i);

  const fake = new FakeObs(); const logs: string[] = [];
  const controller = new ObsController(fake, { info: (message, details) => logs.push(`${message}${JSON.stringify(details)}`), warn: () => undefined });
  assert.equal(controller.getState().connection, "DISCONNECTED");
  let state = await controller.connect({ host: "127.0.0.1", port: 4455, password: "top-secret" });
  assert.equal(state.connection, "CONNECTED"); assert.deepEqual(state.scenes, ["Main", "Break"]); assert.equal(state.currentScene, "Main");
  assert.deepEqual(controller.getScenes(), ["Main", "Break"]);
  assert.equal(logs.join(" ").includes("top-secret"), false, "password must never be logged");
  state = await controller.switchScene("Break"); assert.equal(state.currentScene, "Break");
  await assert.rejects(controller.switchScene("Missing"), /no longer exists/);
  state = await controller.startStream(); assert.equal(state.streaming, true);
  state = await controller.startRecording(); assert.equal(state.recording, true);
  fake.emit("CurrentProgramSceneChanged", { sceneName: "Main" }); assert.equal(controller.getState().currentScene, "Main");
  fake.emit("SceneListChanged", { scenes: [{ sceneName: "Main" }, { sceneName: "Ending" }, { sceneName: "Ending" }] }); assert.deepEqual(controller.getScenes(), ["Main", "Ending"]);
  fake.emit("StreamStateChanged", { outputActive: false }); assert.equal(controller.getState().streaming, false);
  fake.emit("RecordStateChanged", { outputActive: false }); assert.equal(controller.getState().recording, false);
  state = await controller.disconnect(); assert.equal(state.connection, "DISCONNECTED"); assert.equal(state.streaming, false);

  const reconnectClient = new FakeObs(); const timer = new FakeTimer();
  const reconnecting = new ObsController(reconnectClient, { info: () => undefined, warn: () => undefined }, timer);
  await reconnecting.connect({ host: "localhost", port: 4455 });
  reconnectClient.emit("ConnectionClosed");
  assert.equal(reconnecting.getState().connection, "DISCONNECTED"); assert.equal(timer.pending[0]?.delay, 1_000);
  await reconnecting.disconnect(); assert.equal(timer.pending.length, 0); assert.equal(timer.cleared, 1);

  const preload = await readFile(join(process.cwd(), "preload/preload.ts"), "utf8");
  assert.match(preload, /getState: \(\) => invoke\("obs:get-state"\)/);
  assert.match(preload, /getScenes: \(\) => invoke\("obs:get-scenes"\)/);
  assert.doesNotMatch(preload, /\bcall:\s*|rawObs|child_process|\bWebSocket\s*:/i, "preload must not expose arbitrary OBS or system access");
  const renderer = await readFile(join(process.cwd(), "renderer/desktop-shell.ts"), "utf8");
  assert.doesNotMatch(renderer, /localStorage[^\n]*password|password[^\n]*localStorage/i);
  const main = await readFile(join(process.cwd(), "main/main.ts"), "utf8");
  const settingsStart = main.indexOf("obs:settings");
  const settingsEnd = main.indexOf("obs:get-state");
  const settingsHandler = main.slice(settingsStart, settingsEnd);
  assert.doesNotMatch(settingsHandler, /password\s*:/, "settings IPC must never return the decrypted password");
  assert.ok(main.indexOf("validateObsConfig") < main.indexOf("obsSettings.save(config"), "connection payload must be validated before storage");
  console.info("OBS controller and validation tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
