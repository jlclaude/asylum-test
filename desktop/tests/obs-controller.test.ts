import assert from "node:assert/strict";
import { ObsController } from "../main/obs/ObsController";
import { obsWebSocketUrl, validateObsConfig, validateSceneName } from "../main/obs/obs-validation";
import type { ObsClient } from "../main/obs/obs-types";

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

async function run() {
  assert.deepEqual(validateObsConfig({ host: "localhost", port: 4455 }), { host: "localhost", port: 4455 });
  assert.throws(() => validateObsConfig({ host: "192.168.1.2", port: 4455 }), /this computer/);
  assert.throws(() => validateObsConfig({ host: "localhost", port: 70000 }), /port/);
  assert.equal(obsWebSocketUrl({ host: "::1", port: 4455 }), "ws://[::1]:4455");
  assert.throws(() => validateSceneName(""), /scene/i);

  const fake = new FakeObs(); const logs: string[] = [];
  const controller = new ObsController(fake, { info: (message, details) => logs.push(`${message}${JSON.stringify(details)}`), warn: () => undefined });
  assert.equal(controller.getState().connection, "DISCONNECTED");
  let state = await controller.connect({ host: "127.0.0.1", port: 4455, password: "top-secret" });
  assert.equal(state.connection, "CONNECTED"); assert.deepEqual(state.scenes, ["Main", "Break"]); assert.equal(state.currentScene, "Main");
  assert.equal(logs.join(" ").includes("top-secret"), false, "password must never be logged");
  state = await controller.switchScene("Break"); assert.equal(state.currentScene, "Break");
  await assert.rejects(controller.switchScene("Missing"), /no longer exists/);
  state = await controller.startStream(); assert.equal(state.streaming, true);
  state = await controller.startRecording(); assert.equal(state.recording, true);
  fake.emit("CurrentProgramSceneChanged", { sceneName: "Main" }); assert.equal(controller.getState().currentScene, "Main");
  state = await controller.disconnect(); assert.equal(state.connection, "DISCONNECTED"); assert.equal(state.streaming, false);
  console.info("OBS controller and validation tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
