export type ObsConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export type ObsState = {
  connection: ObsConnectionState;
  currentScene: string | null;
  scenes: string[];
  streaming: boolean;
  recording: boolean;
  lastError: string | null;
};

export type ObsConnectConfig = {
  host: string;
  port: number;
  password?: string;
};

export type ObsProgramPreview = {
  imageDataUrl: string | null;
  sceneName: string | null;
};

export type ObsStoredSettings = {
  host: string;
  port: number;
  rememberSettings: boolean;
  passwordStored: boolean;
};

export type ObsClient = {
  connect(url: string, password?: string): Promise<unknown>;
  disconnect(): Promise<void>;
  call(requestType: string, requestData?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (event?: unknown) => void): unknown;
};

export type ObsLogger = {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
};

export type ObsTimer = {
  set(callback: () => void, delayMs: number): unknown;
  clear(timer: unknown): void;
};
