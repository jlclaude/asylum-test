import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("asylumBroadcastDesktop", {
  reportHealth: (value: unknown) => ipcRenderer.send("broadcast:health", value),
});

export {};
