import { contextBridge, ipcRenderer } from "electron";

// This is the only bridge exposed to the hosted Host Portal. It accepts a small,
// typed context payload and never exposes Electron, cookies, or filesystem access.
contextBridge.exposeInMainWorld("asylumDesktopHost", {
  updateIntegrationContext: (context: {
    activeGameId: string;
    activeRaffleCode: string;
    activeGameTitle: string;
    hostCsrfToken: string;
    broadcastUrl: string;
    publicClaimUrl: string;
    facebookPost: string;
  }) => ipcRenderer.invoke("integration:update", context),
  emitAutomationEvent: (event: { event: "SPIN" | "WINNER" | "SECOND_CHANCE" | "REWARD" | "ACCEPT_RESULT" | "RAFFLE_FINISHED" | "CELEBRATE"; wheelId?: string; winner?: unknown }) => ipcRenderer.send("automation:event", event),
});
