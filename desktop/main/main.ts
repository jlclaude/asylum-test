import { app, BaseWindow, BrowserWindow, clipboard, dialog, ipcMain, session, WebContentsView } from "electron";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFacebookView, clearFacebookSession } from "./facebook-view";
import { goBack, goForward, navigate } from "./navigation";
import { ASYLUM_ORIGIN, denyPermissions, isAsylumUrl, openExternalHttps, restrictNavigation } from "./security";
import { ObsController } from "./obs/ObsController";
import { ObsSettingsStore } from "./obs/obs-settings";
import type { ObsConnectConfig, ObsMappingKey } from "./obs/obs-types";
import { validateObsConfig } from "./obs/obs-validation";
import { exportStudioProfile, importStudioProfile, validateObsSceneMappings } from "./obs/obs-scene-mappings";
import { ObsAutomationEngine, type ObsAutomationEvent } from "./obs/ObsAutomationEngine";
import { WinnerPresentationController, type WinnerOverlayState, type WinnerPresentationSettings } from "./winner/WinnerPresentationController";

const hostUrl = process.env.ASYLUM_DESKTOP_HOST_URL ?? `${ASYLUM_ORIGIN}/host`;
const hostOrigin = new URL(hostUrl).origin;
const facebookGroupUrl = process.env.ASYLUM_DESKTOP_FACEBOOK_URL ?? "https://www.facebook.com/";
let windowRef: BrowserWindow | null = null;
let hostView: WebContentsView | null = null;
let facebookView: WebContentsView | null = null;
let currentGameLink = "";
let currentFacebookPost = "";
let currentGameId = "";
let obsController: ObsController;
let obsSettings: ObsSettingsStore;
let obsAutomation: ObsAutomationEngine;
let winnerPresentation: WinnerPresentationController;
const viewStates = { host: "loading", facebook: "loading" } as Record<"host" | "facebook", "loading" | "ready" | "failed" | "crashed">;

function status(target: "host" | "facebook", state: "loading" | "ready" | "failed" | "crashed") {
  viewStates[target] = state;
  const view = target === "host" ? hostView : facebookView;
  view?.setVisible(state === "loading" || state === "ready");
  windowRef?.webContents.send("desktop:status", { target, state });
}

function track(view: WebContentsView, target: "host" | "facebook") {
  view.webContents.on("did-start-loading", () => { if (target === "host") winnerPresentation?.reset(); status(target, "loading"); });
  view.webContents.on("did-finish-load", () => status(target, "ready"));
  view.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) { console.warn(`[desktop] ${target} navigation failed`, { code, origin: safeOrigin(url) }); status(target, "failed"); }
  });
  view.webContents.on("render-process-gone", (_event, details) => { console.warn(`[desktop] ${target} renderer gone`, details.reason); status(target, "crashed"); });
}

function safeOrigin(rawUrl: string) { try { return new URL(rawUrl).origin; } catch { return "invalid-url"; } }

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1200, minHeight: 750,
    title: "Asylum Games Desktop", backgroundColor: "#090c10",
    webPreferences: { preload: join(__dirname, "../preload/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  windowRef.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged) windowRef.webContents.openDevTools({ mode: "detach" });
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  denyPermissions(windowRef.webContents);

  hostView = new WebContentsView({ webPreferences: {
    partition: "persist:asylum-host",
    preload: join(__dirname, "../preload/host-preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  } });
  facebookView = createFacebookView();
  windowRef.contentView.addChildView(hostView);
  windowRef.contentView.addChildView(facebookView);
  restrictNavigation(hostView.webContents, (url) => isAsylumUrl(url, hostOrigin));
  denyPermissions(hostView.webContents);
  track(hostView, "host"); track(facebookView, "facebook");
  void navigate(hostView.webContents, hostUrl);
  void navigate(facebookView.webContents, facebookGroupUrl);
  windowRef.on("closed", () => { hostView?.webContents.close(); facebookView?.webContents.close(); hostView = null; facebookView = null; windowRef = null; });
}

function validRect(value: unknown): value is Electron.Rectangle {
  if (!value || typeof value !== "object") return false;
  return ["x", "y", "width", "height"].every((key) => Number.isFinite((value as Record<string, unknown>)[key])) && (value as Electron.Rectangle).width >= 0 && (value as Electron.Rectangle).height >= 0;
}

function registerIpc() {
  const fromShell = (event: Electron.IpcMainInvokeEvent) => event.sender === windowRef?.webContents;
  ipcMain.handle("desktop:version", (event) => fromShell(event) ? app.getVersion() : "");
  ipcMain.handle("layout:update", (event, layout: { host?: unknown; facebook?: unknown }) => {
    if (event.sender !== windowRef?.webContents || !validRect(layout?.host)) return;
    hostView?.setBounds(layout.host);
    hostView?.setVisible(viewStates.host === "loading" || viewStates.host === "ready");
    if (validRect(layout.facebook)) {
      facebookView?.setVisible(viewStates.facebook === "loading" || viewStates.facebook === "ready");
      facebookView?.setBounds(layout.facebook);
    } else facebookView?.setVisible(false);
  });
  ipcMain.handle("host:retry", (event) => fromShell(event) && hostView ? navigate(hostView.webContents, hostUrl) : undefined);
  ipcMain.handle("host:reload", (event) => { if (fromShell(event)) hostView?.webContents.reload(); });
  ipcMain.handle("host:open-portal", (event) => fromShell(event) && hostView ? navigate(hostView.webContents, hostUrl) : undefined);
  ipcMain.handle("host:open-broadcast", (event) => fromShell(event) && hostView ? navigate(hostView.webContents, `${hostOrigin}/broadcast${currentGameId ? `?gameId=${encodeURIComponent(currentGameId)}` : ""}`) : undefined);
  ipcMain.handle("host:open-external", (event) => { if (fromShell(event)) openExternalHttps(hostView?.webContents.getURL() || hostUrl); });
  ipcMain.handle("facebook:back", (event) => { if (fromShell(event) && facebookView) goBack(facebookView.webContents); });
  ipcMain.handle("facebook:forward", (event) => { if (fromShell(event) && facebookView) goForward(facebookView.webContents); });
  ipcMain.handle("facebook:reload", (event) => { if (fromShell(event)) facebookView?.webContents.reload(); });
  ipcMain.handle("facebook:retry", (event) => fromShell(event) && facebookView ? navigate(facebookView.webContents, facebookGroupUrl) : undefined);
  ipcMain.handle("facebook:open-group", (event) => fromShell(event) && facebookView ? navigate(facebookView.webContents, facebookGroupUrl) : undefined);
  ipcMain.handle("facebook:open-external", (event) => { if (fromShell(event)) openExternalHttps(facebookView?.webContents.getURL() || facebookGroupUrl); });
  ipcMain.handle("facebook:clear-session", async (event) => { if (!fromShell(event)) return; await clearFacebookSession(); await facebookView?.webContents.reload(); });
  ipcMain.handle("integration:copy-game-link", (event) => { if (!fromShell(event) || !currentGameLink) return false; clipboard.writeText(currentGameLink); return true; });
  ipcMain.handle("integration:copy-facebook-post", (event) => { if (!fromShell(event) || !currentFacebookPost) return false; clipboard.writeText(currentFacebookPost); return true; });
  ipcMain.handle("integration:update", (event, context: unknown) => {
    if (event.sender !== hostView?.webContents || !context || typeof context !== "object") return false;
    const candidate = context as Record<string, unknown>;
    if (typeof candidate.gameId !== "string" || candidate.gameId.length > 200) return false;
    if (typeof candidate.publicClaimUrl !== "string" || !isAsylumUrl(candidate.publicClaimUrl, hostOrigin)) return false;
    if (typeof candidate.facebookPost !== "string" || candidate.facebookPost.length > 10_000) return false;
    currentGameLink = candidate.publicClaimUrl;
    currentGameId = candidate.gameId;
    currentFacebookPost = candidate.facebookPost;
    return true;
  });
  ipcMain.on("automation:event", (event, payload: unknown) => {
    if (event.sender !== hostView?.webContents || !payload || typeof payload !== "object") return;
    const candidate = payload as Record<string, unknown>;
    const allowed = ["SPIN", "WINNER", "SECOND_CHANCE", "REWARD", "ACCEPT_RESULT", "RAFFLE_FINISHED", "CELEBRATE"] as const;
    if (typeof candidate.event !== "string" || !allowed.includes(candidate.event as typeof allowed[number])) return;
    if (candidate.wheelId !== undefined && (typeof candidate.wheelId !== "string" || candidate.wheelId.length > 200)) return;
    if (candidate.event === "CELEBRATE") {
      const value = candidate.winner as Record<string, unknown> | undefined; if (!value) return;
      const text = (key: string, nullable = false) => { const raw = value[key]; if (nullable && (raw === null || raw === undefined)) return null; return typeof raw === "string" && raw.length <= 512 ? raw : undefined; };
      const identity = text("identity"), raffleCode = text("raffleCode"), gameTitle = text("gameTitle"), wheelLabel = text("wheelLabel"), wheelType = text("wheelType"), winnerDisplayName = text("winnerDisplayName", true), rewardValue = text("rewardValue", true), secondChanceBefore = text("secondChanceBefore", true), secondChanceAfter = text("secondChanceAfter", true);
      if (!identity || !raffleCode || !gameTitle || !wheelLabel || (wheelType !== "NAME" && wheelType !== "VALUE") || winnerDisplayName === undefined || rewardValue === undefined || secondChanceBefore === undefined || secondChanceAfter === undefined) return;
      const state: WinnerOverlayState = { visible: true, raffleCode, gameTitle, wheelLabel, wheelType, winnerDisplayName, rewardValue, secondChanceBefore, secondChanceAfter, revealedAt: new Date().toISOString() };
      void obsSettings.loadSceneMappings().then((settings) => winnerPresentation.present(identity, state, false, wheelType === "VALUE" ? settings.delays.reward : settings.delays.winner)); return;
    }
    if (candidate.event === "ACCEPT_RESULT") winnerPresentation.hide();
    void obsAutomation.handle(candidate.event as ObsAutomationEvent).catch(() => console.warn("[desktop][obs] automation event failed safely"));
  });
  const obsAction = (channel: string, action: (...args: unknown[]) => Promise<unknown> | unknown) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromShell(event)) return { ok: false, error: "Unauthorized request." };
      try { return { ok: true, value: await action(...args) }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "OBS request failed." }; }
    });
  };
  obsAction("obs:settings", async () => {
    const saved = await obsSettings.load();
    return { config: { host: saved.config.host, port: saved.config.port }, settings: saved.settings };
  });
  obsAction("obs:get-state", () => obsController.getState());
  obsAction("obs:get-scenes", () => obsController.getScenes());
  obsAction("obs:get-program-preview", () => obsController.getProgramPreview());
  obsAction("obs:test-program-preview", () => obsController.getProgramPreview(true));
  obsAction("obs:get-scene-mappings", () => obsSettings.loadSceneMappings());
  obsAction("obs:get-automation-status", () => obsAutomation.getStatus());
  const publicWinnerSettings = (value: WinnerPresentationSettings) => ({ enabled: value.enabled, confetti: value.confetti, sound: value.sound, volume: value.volume, overlayDelay: value.overlayDelay, duration: value.duration, audioSelected: Boolean(value.audioFile) });
  obsAction("winner:get-settings", async () => publicWinnerSettings(await obsSettings.loadWinnerPresentation()));
  obsAction("winner:save-settings", async (value) => { if (!value || typeof value !== "object") throw new Error("Invalid winner settings."); const v = value as WinnerPresentationSettings; const current = await obsSettings.loadWinnerPresentation(); const settings: WinnerPresentationSettings = { enabled: v.enabled === true, confetti: v.confetti === true, sound: v.sound === true, volume: Math.max(0, Math.min(1, Number(v.volume))), overlayDelay: Math.max(0, Math.min(60_000, Math.round(Number(v.overlayDelay)))), duration: Math.max(250, Math.min(60_000, Math.round(Number(v.duration)))), audioFile: current.audioFile }; await obsSettings.saveWinnerPresentation(settings); return publicWinnerSettings(settings); });
  obsAction("winner:choose-audio", async () => { const result = await dialog.showOpenDialog({ title: "Winner Celebration Sound", filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg"] }], properties: ["openFile"] }); if (result.canceled || !result.filePaths[0]) return null; const settings = await obsSettings.loadWinnerPresentation(); settings.audioFile = result.filePaths[0]; await obsSettings.saveWinnerPresentation(settings); return publicWinnerSettings(settings); });
  obsAction("winner:test", async (mode) => { if (mode !== "overlay" && mode !== "confetti" && mode !== "sound") throw new Error("Invalid winner test."); return winnerPresentation.present(`test-winner-${mode}`, { visible: true, raffleCode: "ASY-TEST-000001", gameTitle: "Asylum Games Test", wheelLabel: "Test Containment", wheelType: "NAME", winnerDisplayName: "TEST WINNER", rewardValue: null, secondChanceBefore: null, secondChanceAfter: null, revealedAt: new Date().toISOString() }, true, 0, { enabled: true, overlayDelay: 0, confetti: mode !== "sound", sound: mode !== "confetti" }); });
  obsAction("winner:replay", () => winnerPresentation.replay());
  obsAction("winner:hide", () => winnerPresentation.hide());
  obsAction("obs:save-scene-mappings", async (value) => {
    const mappings = validateObsSceneMappings(value, obsController.getScenes());
    await obsSettings.saveSceneMappings(mappings);
    return mappings;
  });
  obsAction("obs:test-mapped-scene", async (value) => {
    const allowed: ObsMappingKey[] = ["host", "wheel", "winner", "secondChance", "reward", "break", "ending"];
    if (typeof value !== "string" || !allowed.includes(value as ObsMappingKey)) throw new Error("Invalid OBS scene mapping.");
    const mappings = await obsSettings.loadSceneMappings(); const sceneName = mappings.scenes[value as ObsMappingKey];
    if (!sceneName || !obsController.getScenes().includes(sceneName)) throw new Error("Mapped scene is unavailable.");
    return obsController.switchScene(sceneName);
  });
  obsAction("obs:export-studio-profile", async () => {
    const result = await dialog.showSaveDialog({ title: "Export Studio Profile", defaultPath: "asylum-studio-profile.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return { exported: false };
    await writeFile(result.filePath, `${JSON.stringify(exportStudioProfile(await obsSettings.loadSceneMappings()), null, 2)}\n`, { mode: 0o600 });
    return { exported: true };
  });
  obsAction("obs:import-studio-profile", async () => {
    const result = await dialog.showOpenDialog({ title: "Import Studio Profile", filters: [{ name: "JSON", extensions: ["json"] }], properties: ["openFile"] });
    if (result.canceled || !result.filePaths[0]) return { imported: false };
    const raw = await readFile(result.filePaths[0], "utf8"); if (raw.length > 100_000) throw new Error("Studio profile is too large.");
    const mappings = importStudioProfile(JSON.parse(raw) as unknown); await obsSettings.saveSceneMappings(mappings);
    return { imported: true, mappings };
  });
  obsAction("obs:connect", async (payload) => {
    if (!payload || typeof payload !== "object") throw new Error("Invalid OBS connection settings.");
    const candidate = payload as ObsConnectConfig & { rememberSettings?: boolean };
    if (candidate.rememberSettings !== undefined && typeof candidate.rememberSettings !== "boolean") throw new Error("Invalid OBS connection settings.");
    const saved = await obsSettings.load();
    const config = validateObsConfig({ host: candidate.host, port: candidate.port, password: candidate.password || (saved.config.host === candidate.host && saved.config.port === candidate.port ? saved.config.password : undefined) });
    await obsSettings.save(config, candidate.rememberSettings === true);
    await obsController.connect(config);
    return obsController.getState();
  });
  obsAction("obs:disconnect", () => obsController.disconnect());
  obsAction("obs:refresh", () => obsController.refresh());
  obsAction("obs:switch-scene", (sceneName) => obsController.switchScene(sceneName));
  obsAction("obs:start-stream", () => obsController.startStream());
  obsAction("obs:stop-stream", () => obsController.stopStream());
  obsAction("obs:start-recording", () => obsController.startRecording());
  obsAction("obs:stop-recording", () => obsController.stopRecording());
}

app.whenReady().then(() => {
  console.info("[desktop] starting", app.getVersion());
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  obsSettings = new ObsSettingsStore();
  obsController = new ObsController();
  obsAutomation = new ObsAutomationEngine(obsController, obsSettings);
  winnerPresentation = new WinnerPresentationController(() => obsSettings.loadWinnerPresentation());
  obsController.subscribe((state) => { if (state.connection !== "CONNECTED") obsAutomation.markUnavailable(); windowRef?.webContents.send("obs:state-changed", state); });
  obsAutomation.subscribe((state) => windowRef?.webContents.send("obs:automation-state-changed", state));
  registerIpc(); createWindow();
  app.on("activate", () => { if (BaseWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { winnerPresentation?.dispose(); obsAutomation?.dispose(); void obsController?.disconnect(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
