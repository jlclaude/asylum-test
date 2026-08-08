import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("asylumWinner", {
  onShow: (callback: (payload: unknown) => void) => { const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload); ipcRenderer.on("winner:show", listener); return () => ipcRenderer.removeListener("winner:show", listener); },
  onHide: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on("winner:hide", listener); return () => ipcRenderer.removeListener("winner:hide", listener); },
});
