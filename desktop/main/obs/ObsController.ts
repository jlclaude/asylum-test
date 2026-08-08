import ObsWebSocketClient from "obs-websocket-js";
import type {
  ObsClient,
  ObsConnectConfig,
  ObsLogger,
  ObsProgramPreview,
  ObsState,
  ObsTimer,
} from "./obs-types";
import {
  normalizeSceneList,
  obsWebSocketUrl,
  validateObsConfig,
  validateSceneName,
} from "./obs-validation";

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

const defaultLogger: ObsLogger = {
  info: (message, details) => console.info(`[desktop][obs] ${message}`, details ?? {}),
  warn: (message, details) => console.warn(`[desktop][obs] ${message}`, details ?? {}),
};

const defaultTimer: ObsTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

function createClient(): ObsClient {
  return new ObsWebSocketClient() as unknown as ObsClient;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function safeError(error: unknown): { message: string; category: string } {
  const details = record(error);
  const raw = error instanceof Error ? error.message : String(details.message ?? "");
  const code = Number(details.code);
  if (code === 4009 || /auth|password|identify/i.test(raw)) {
    return { category: "AUTHENTICATION", message: "OBS authentication failed. Check the WebSocket password." };
  }
  return {
    category: "CONNECTION",
    message: "Cannot connect to OBS. Verify OBS is running and WebSocket Server is enabled.",
  };
}

export class ObsController {
  private state: ObsState = {
    connection: "DISCONNECTED",
    currentScene: null,
    scenes: [],
    streaming: false,
    recording: false,
    lastError: null,
  };
  private readonly subscribers = new Set<(state: ObsState) => void>();
  private config: ObsConnectConfig | null = null;
  private manuallyDisconnected = true;
  private reconnectAttempt = 0;
  private reconnectTimer: unknown = null;
  private connecting: Promise<ObsState> | null = null;

  constructor(
    private readonly client: ObsClient = createClient(),
    private readonly logger: ObsLogger = defaultLogger,
    private readonly timer: ObsTimer = defaultTimer,
  ) {
    this.bindEvents();
  }

  getState(): ObsState {
    return { ...this.state, scenes: [...this.state.scenes] };
  }

  subscribe(callback: (state: ObsState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    return () => this.subscribers.delete(callback);
  }

  async connect(value: unknown): Promise<ObsState> {
    const config = validateObsConfig(value);
    if (this.connecting) return this.connecting;
    this.config = config;
    this.manuallyDisconnected = false;
    this.clearReconnect();
    this.patch({ connection: "CONNECTING", lastError: null });
    this.logger.info("connection attempt", { host: config.host, port: config.port });
    this.connecting = this.open(config).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async disconnect(): Promise<ObsState> {
    this.manuallyDisconnected = true;
    this.config = null;
    this.reconnectAttempt = 0;
    this.clearReconnect();
    try { await this.client.disconnect(); } catch { /* already disconnected */ }
    this.reset("DISCONNECTED", null);
    this.logger.info("disconnected", { manual: true });
    return this.getState();
  }

  async refresh(): Promise<ObsState> {
    this.requireConnected();
    const [sceneResponse, streamResponse, recordResponse] = await Promise.all([
      this.client.call("GetSceneList"),
      this.client.call("GetStreamStatus"),
      this.client.call("GetRecordStatus"),
    ]);
    const scene = record(sceneResponse);
    const stream = record(streamResponse);
    const recording = record(recordResponse);
    this.patch({
      scenes: normalizeSceneList(scene.scenes),
      currentScene: typeof scene.currentProgramSceneName === "string" ? scene.currentProgramSceneName : null,
      streaming: Boolean(stream.outputActive),
      recording: Boolean(recording.outputActive),
      lastError: null,
    });
    return this.getState();
  }

  getScenes(): string[] {
    return [...this.state.scenes];
  }

  async getProgramPreview(diagnostic = false): Promise<ObsProgramPreview> {
    this.requireConnected();
    const sceneName = this.state.currentScene;
    if (!sceneName) return { imageDataUrl: null, sceneName: null };
    try {
      const sceneItems = record(await this.client.call("GetSceneItemList", { sceneName }));
      const sources = Array.isArray(sceneItems.sceneItems) ? sceneItems.sceneItems.map((item) => { const value = record(item); return { sourceName: value.sourceName, sourceType: value.sourceType, sceneItemEnabled: value.sceneItemEnabled }; }) : [];
      if (sources.length === 0) throw Object.assign(new Error("Preview source unavailable."), { code: 600 });
      const response = record(await this.client.call("GetSourceScreenshot", {
        sourceName: sceneName,
        imageFormat: "png",
        imageWidth: 960,
        imageHeight: 540,
        imageCompressionQuality: 70,
      }));
      if (diagnostic) {
        const imageData = typeof response.imageData === "string" ? response.imageData : "";
        this.logger.info("preview test", { sourceName: sceneName, responseReceived: true, imageDataPresent: Boolean(imageData), imageDataLength: imageData.length, imageDataPrefix: imageData.slice(0, imageData.indexOf(",") + 1), imageWidth: 960, imageHeight: 540, sources });
      }
      if (this.state.currentScene !== sceneName) return { imageDataUrl: null, sceneName: this.state.currentScene };
      const returnedImage = response.imageData;
      if (typeof returnedImage !== "string" || returnedImage.length > 8_000_000) {
        throw new Error("invalid screenshot response");
      }
      const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(returnedImage);
      const base64 = match?.[2] ?? (/^[A-Za-z0-9+/=]+$/.test(returnedImage) ? returnedImage : null);
      if (!base64) throw new Error("invalid screenshot response");
      const format = match?.[1] === "png" ? "png" : "jpeg";
      return { imageDataUrl: `data:image/${format};base64,${base64}`, sceneName };
    } catch (error) {
      if (diagnostic) this.logger.warn("preview test failed", { sourceName: sceneName, responseReceived: false, category: "SCREENSHOT_REQUEST" });
      const details = record(error);
      const message = error instanceof Error ? error.message : String(details.message ?? "");
      if (Number(details.code) === 600 || /source.*(?:not found|exist|unavailable)|(?:not found|exist).*source/i.test(message)) {
        throw new Error("Preview source unavailable.");
      }
      throw new Error("Preview temporarily unavailable.");
    }
  }

  async switchScene(value: unknown): Promise<ObsState> {
    this.requireConnected();
    const sceneName = validateSceneName(value);
    if (!this.state.scenes.includes(sceneName)) {
      throw new Error("Scene no longer exists in OBS. Refresh the scene list.");
    }
    try {
      await this.client.call("SetCurrentProgramScene", { sceneName });
      this.patch({ currentScene: sceneName, lastError: null });
      this.logger.info("scene changed", { sceneName });
      return this.getState();
    } catch {
      throw new Error("Scene could not be changed.");
    }
  }

  startStream(): Promise<ObsState> { return this.changeOutput("stream", true); }
  stopStream(): Promise<ObsState> { return this.changeOutput("stream", false); }
  startRecording(): Promise<ObsState> { return this.changeOutput("recording", true); }
  stopRecording(): Promise<ObsState> { return this.changeOutput("recording", false); }

  private async open(config: ObsConnectConfig): Promise<ObsState> {
    try {
      await this.client.connect(obsWebSocketUrl(config), config.password);
      this.reconnectAttempt = 0;
      this.patch({ connection: "CONNECTED", lastError: null });
      this.logger.info("connected", { host: config.host, port: config.port });
      return await this.refresh();
    } catch (error) {
      const safe = safeError(error);
      this.patch({ connection: "ERROR", lastError: safe.message });
      this.logger.warn("connection failed", { host: config.host, port: config.port, category: safe.category });
      return this.getState();
    }
  }

  private async changeOutput(kind: "stream" | "recording", active: boolean): Promise<ObsState> {
    this.requireConnected();
    const current = kind === "stream" ? this.state.streaming : this.state.recording;
    if (current === active) return this.getState();
    const request = kind === "stream"
      ? active ? "StartStream" : "StopStream"
      : active ? "StartRecord" : "StopRecord";
    try {
      await this.client.call(request);
      await this.refresh();
      const changed = kind === "stream" ? this.state.streaming : this.state.recording;
      if (changed !== active) throw new Error("state did not change");
      this.logger.info(`${kind} ${active ? "started" : "stopped"}`);
      return this.getState();
    } catch {
      throw new Error(`OBS did not ${active ? "start" : "stop"} ${kind === "stream" ? "streaming" : "recording"}.`);
    }
  }

  private requireConnected(): void {
    if (this.state.connection !== "CONNECTED") throw new Error("OBS is not connected.");
  }

  private bindEvents(): void {
    this.client.on("ConnectionClosed", () => {
      if (this.manuallyDisconnected) return;
      this.reset("DISCONNECTED", "OBS disconnected. Retry when OBS is available.");
      this.logger.warn("disconnected", { manual: false });
      this.scheduleReconnect();
    });
    this.client.on("ConnectionError", (error) => {
      const safe = safeError(error);
      this.logger.warn("connection error", { category: safe.category });
    });
    this.client.on("CurrentProgramSceneChanged", (event) => {
      const sceneName = record(event).sceneName;
      if (typeof sceneName === "string") this.patch({ currentScene: sceneName });
    });
    this.client.on("SceneListChanged", (event) => {
      this.patch({ scenes: normalizeSceneList(record(event).scenes) });
    });
    this.client.on("StreamStateChanged", (event) => {
      this.patch({ streaming: Boolean(record(event).outputActive) });
    });
    this.client.on("RecordStateChanged", (event) => {
      this.patch({ recording: Boolean(record(event).outputActive) });
    });
  }

  private scheduleReconnect(): void {
    if (this.manuallyDisconnected || !this.config || this.reconnectTimer) return;
    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.patch({ connection: "ERROR", lastError: "OBS reconnect attempts stopped. Select Retry to try again." });
      return;
    }
    const delayMs = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.timer.set(() => {
      this.reconnectTimer = null;
      if (!this.manuallyDisconnected && this.config) {
        void this.open(this.config).then((state) => {
          if (state.connection !== "CONNECTED") this.scheduleReconnect();
        });
      }
    }, delayMs);
    this.logger.info("reconnect scheduled", { attempt: this.reconnectAttempt, delayMs });
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) this.timer.clear(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private reset(connection: "DISCONNECTED" | "ERROR", lastError: string | null): void {
    this.patch({
      connection,
      currentScene: null,
      scenes: [],
      streaming: false,
      recording: false,
      lastError,
    });
  }

  private patch(update: Partial<ObsState>): void {
    this.state = { ...this.state, ...update };
    const snapshot = this.getState();
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}

export { RECONNECT_DELAYS_MS };
