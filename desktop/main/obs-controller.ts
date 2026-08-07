export type ObsConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export type ObsScene = {
  name: string;
};

/** Native studio boundary for a later sprint. No raffle action depends on it. */
export interface ObsController {
  readonly state: ObsConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getScenes(): Promise<ObsScene[]>;
  switchScene(sceneName: string): Promise<void>;
  startStream(): Promise<void>;
  stopStream(): Promise<void>;
}
