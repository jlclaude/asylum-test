export {};
declare global {
  type ObsConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  interface ObsState { connection: ObsConnectionState; scenes: string[]; currentScene: string | null; streaming: boolean; recording: boolean; lastError: string | null; }
  interface ObsResult<T> { ok: boolean; value?: T; error?: string; }
  interface ObsProgramPreview { imageDataUrl: string | null; sceneName: string | null; }
  type ObsMappingKey = "host" | "wheel" | "winner" | "secondChance" | "reward" | "break" | "ending";
  interface ObsSceneMappings { scenes: Record<ObsMappingKey, string | null>; automation: { spinToWheel: boolean; revealToWinner: boolean; secondChance: boolean; reward: boolean; acceptToHost: boolean; finishToEnding: boolean } }
  interface Window { asylumDesktop: {
    version(): Promise<string>; layout: { update(layout: DesktopLayout): Promise<void> };
    host: { retry(): Promise<void>; reload(): Promise<void>; openExternal(): Promise<void> };
    facebook: { back(): Promise<void>; forward(): Promise<void>; reload(): Promise<void>; retry(): Promise<void>; openGroup(): Promise<void>; openExternal(): Promise<void>; clearSession(): Promise<void> };
    integration: { copyGameLink(): Promise<boolean>; copyFacebookPost(): Promise<boolean> };
    obs: {
      settings(): Promise<ObsResult<{ config: { host: string; port: number }; settings: { rememberSettings: boolean; passwordStored: boolean } }>>; getState(): Promise<ObsResult<ObsState>>; getScenes(): Promise<ObsResult<string[]>>; getProgramPreview(): Promise<ObsResult<ObsProgramPreview>>; testProgramPreview(): Promise<ObsResult<ObsProgramPreview>>; getSceneMappings(): Promise<ObsResult<ObsSceneMappings>>; saveSceneMappings(mappings: ObsSceneMappings): Promise<ObsResult<ObsSceneMappings>>; testMappedScene(mapping: ObsMappingKey): Promise<ObsResult<ObsState>>; exportStudioProfile(): Promise<ObsResult<{ exported: boolean }>>; importStudioProfile(): Promise<ObsResult<{ imported: boolean; mappings?: ObsSceneMappings }>>;
      connect(settings: { host: string; port: number; password: string; rememberSettings: boolean }): Promise<ObsResult<ObsState>>; disconnect(): Promise<ObsResult<ObsState>>; refresh(): Promise<ObsResult<ObsState>>;
      switchScene(name: string): Promise<ObsResult<ObsState>>; startStream(): Promise<ObsResult<ObsState>>; stopStream(): Promise<ObsResult<ObsState>>; startRecording(): Promise<ObsResult<ObsState>>; stopRecording(): Promise<ObsResult<ObsState>>;
      onStateChanged(callback: (state: ObsState) => void): () => void;
    };
    onStatus(callback: (status: DesktopStatus) => void): () => void;
  } }
  interface DesktopLayout { host: { x: number; y: number; width: number; height: number }; facebook: { x: number; y: number; width: number; height: number } | null; }
  interface DesktopStatus { target: "host" | "facebook"; state: "loading" | "ready" | "failed" | "crashed"; }
}
