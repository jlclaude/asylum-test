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
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("desktop:status", listener);
    return () => ipcRenderer.removeListener("desktop:status", listener);
  },
});
