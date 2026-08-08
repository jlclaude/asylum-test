import { contextBridge, ipcRenderer } from "electron";

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("asylumDesktop", {
  version: () => invoke("desktop:version"),
  layout: {
    update: (layout: unknown) => invoke("layout:update", layout),
  },
  host: {
    retry: () => invoke("host:retry"),
    reload: () => invoke("host:reload"),
    openExternal: () => invoke("host:open-external"),
  },
  facebook: {
    back: () => invoke("facebook:back"),
    forward: () => invoke("facebook:forward"),
    reload: () => invoke("facebook:reload"),
    retry: () => invoke("facebook:retry"),
    openGroup: () => invoke("facebook:open-group"),
    openExternal: () => invoke("facebook:open-external"),
    clearSession: () => invoke("facebook:clear-session"),
  },
  integration: {
    copyGameLink: () => invoke("integration:copy-game-link"),
    copyFacebookPost: () => invoke("integration:copy-facebook-post"),
  },
  winner: { getSettings: () => invoke("winner:get-settings"), saveSettings: (value: unknown) => invoke("winner:save-settings", value), chooseAudio: () => invoke("winner:choose-audio"), test: (mode: string) => invoke("winner:test", mode), replay: () => invoke("winner:replay"), hide: () => invoke("winner:hide") },
  obs: {
    settings: () => invoke("obs:settings"),
    getState: () => invoke("obs:get-state"),
    getScenes: () => invoke("obs:get-scenes"),
    getProgramPreview: () => invoke("obs:get-program-preview"),
    testProgramPreview: () => invoke("obs:test-program-preview"),
    getSceneMappings: () => invoke("obs:get-scene-mappings"),
    getAutomationStatus: () => invoke("obs:get-automation-status"),
    saveSceneMappings: (mappings: unknown) => invoke("obs:save-scene-mappings", mappings),
    testMappedScene: (mapping: string) => invoke("obs:test-mapped-scene", mapping),
    exportStudioProfile: () => invoke("obs:export-studio-profile"),
    importStudioProfile: () => invoke("obs:import-studio-profile"),
    connect: (settings: unknown) => invoke("obs:connect", settings),
    disconnect: () => invoke("obs:disconnect"),
    refresh: () => invoke("obs:refresh"),
    switchScene: (sceneName: string) => invoke("obs:switch-scene", sceneName),
    startStream: () => invoke("obs:start-stream"), stopStream: () => invoke("obs:stop-stream"),
    startRecording: () => invoke("obs:start-recording"), stopRecording: () => invoke("obs:stop-recording"),
    onStateChanged: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("obs:state-changed", listener);
      return () => ipcRenderer.removeListener("obs:state-changed", listener);
    },
    onAutomationStateChanged: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("obs:automation-state-changed", listener);
      return () => ipcRenderer.removeListener("obs:automation-state-changed", listener);
    },
  },
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("desktop:status", listener);
    return () => ipcRenderer.removeListener("desktop:status", listener);
  },
});
