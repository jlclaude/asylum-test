export {};
declare global {
  type ObsConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  interface ObsState { connection: ObsConnectionState; scenes: string[]; currentScene: string | null; streaming: boolean; recording: boolean; lastError: string | null; }
  interface ObsResult<T> { ok: boolean; value?: T; error?: string; }
  interface ObsProgramPreview { imageDataUrl: string | null; sceneName: string | null; }
  type ObsMappingKey = "host" | "wheel" | "winner" | "secondChance" | "reward" | "break" | "ending";
  interface ObsSceneMappings { scenes: Record<ObsMappingKey, string | null>; automation: { enabled: boolean; spinToWheel: boolean; revealToWinner: boolean; secondChance: boolean; reward: boolean; acceptToHost: boolean; finishToEnding: boolean }; delays: { wheel: number; winner: number; secondChance: number; reward: number; host: number } }
  interface ObsAutomationStatus { mode: "WAITING" | "WHEEL" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "HOST" | "ENDING"; pending: string | null; log: Array<{ at: string; mode: string; sceneName: string; message: string }> }
  interface WinnerPresentationPublic { enabled: boolean; confetti: boolean; sound: boolean; volume: number; overlayDelay: number; duration: number; audioSelected: boolean }
  interface Window { asylumDesktop: {
    version(): Promise<string>; layout: { update(layout: DesktopLayout): Promise<void> };
    host: { retry(): Promise<void>; reload(): Promise<void>; openPortal(): Promise<void>; openBroadcast(): Promise<void>; openExternal(): Promise<void> };
    facebook: { back(): Promise<void>; forward(): Promise<void>; reload(): Promise<void>; retry(): Promise<void>; openGroup(): Promise<void>; openExternal(): Promise<void>; clearSession(): Promise<void> };
    broadcast: { retry(): Promise<void>; copyUrl(): Promise<boolean>; copyObsUrl(): Promise<boolean>; getHealth(): Promise<BroadcastHealth | null>; setScale(scale: number): Promise<boolean>; setSafeAreas(visible: boolean): Promise<boolean> };
    activeGame: { get(): Promise<ActiveGameContext | null>; select(gameId: string, force?: boolean): Promise<boolean>; setLock(locked: boolean): Promise<boolean>; clear(): Promise<boolean> };
    integration: { copyGameLink(): Promise<boolean>; copyFacebookPost(): Promise<boolean> };
    winner: { getSettings(): Promise<ObsResult<WinnerPresentationPublic>>; saveSettings(value: unknown): Promise<ObsResult<WinnerPresentationPublic>>; chooseAudio(): Promise<ObsResult<WinnerPresentationPublic | null>>; test(mode: "overlay" | "confetti" | "sound"): Promise<ObsResult<boolean>>; replay(): Promise<ObsResult<boolean>>; hide(): Promise<ObsResult<void>> };
    obs: {
      settings(): Promise<ObsResult<{ config: { host: string; port: number }; settings: { rememberSettings: boolean; passwordStored: boolean } }>>; getState(): Promise<ObsResult<ObsState>>; getScenes(): Promise<ObsResult<string[]>>; getProgramPreview(): Promise<ObsResult<ObsProgramPreview>>; testProgramPreview(): Promise<ObsResult<ObsProgramPreview>>; getSceneMappings(): Promise<ObsResult<ObsSceneMappings>>; getAutomationStatus(): Promise<ObsResult<ObsAutomationStatus>>; saveSceneMappings(mappings: ObsSceneMappings): Promise<ObsResult<ObsSceneMappings>>; testMappedScene(mapping: ObsMappingKey): Promise<ObsResult<ObsState>>; exportStudioProfile(): Promise<ObsResult<{ exported: boolean }>>; importStudioProfile(): Promise<ObsResult<{ imported: boolean; mappings?: ObsSceneMappings }>>;
      onAutomationStateChanged(callback: (state: ObsAutomationStatus) => void): () => void;
      connect(settings: { host: string; port: number; password: string; rememberSettings: boolean }): Promise<ObsResult<ObsState>>; disconnect(): Promise<ObsResult<ObsState>>; refresh(): Promise<ObsResult<ObsState>>;
      switchScene(name: string): Promise<ObsResult<ObsState>>; startStream(): Promise<ObsResult<ObsState>>; stopStream(): Promise<ObsResult<ObsState>>; startRecording(): Promise<ObsResult<ObsState>>; stopRecording(): Promise<ObsResult<ObsState>>;
      onStateChanged(callback: (state: ObsState) => void): () => void;
    };
    onStatus(callback: (status: DesktopStatus) => void): () => void;
    onActiveGame(callback: (context: ActiveGameContext) => void): () => void;
    onBroadcastHealth(callback: (health: BroadcastHealth) => void): () => void;
  } }
  interface DesktopLayout { host: { x: number; y: number; width: number; height: number } | null; facebook: { x: number; y: number; width: number; height: number } | null; broadcast: { x: number; y: number; width: number; height: number } | null; }
  interface DesktopStatus { target: "host" | "facebook" | "broadcast"; state: "loading" | "ready" | "failed" | "crashed"; }
  interface ActiveGameContext { gameId: string; sourceUrl: string; broadcastUrl: string; raffleCode: string | null; gameTitle: string | null; locked: boolean; }
  interface BroadcastHealth { state: "WAITING" | "READY" | "SPINNING" | "WINNER" | "SECOND_CHANCE" | "REWARD_CHAMBER" | "COMPLETED" | "ERROR"; gameState: "OPEN" | "CLOSED" | "READY" | "IN_PROGRESS" | "COMPLETED" | null; raffleCode: string | null; wheelLabel: string | null; updatedAt: string; status: "live" | "waiting" | "error"; message: string | null; }
}
