import { app, BaseWindow, BrowserWindow, clipboard, ipcMain, session, WebContentsView } from "electron";
import { join } from "node:path";
import { createFacebookView, clearFacebookSession } from "./facebook-view";
import { goBack, goForward, navigate } from "./navigation";
import { ASYLUM_ORIGIN, denyPermissions, isAsylumUrl, openExternalHttps, restrictNavigation } from "./security";
import { ObsController } from "./obs/ObsController";
import { ObsSettingsStore } from "./obs/obs-settings";
import type { ObsConnectConfig } from "./obs/obs-types";

const hostUrl = process.env.ASYLUM_DESKTOP_HOST_URL ?? `${ASYLUM_ORIGIN}/host`;
const hostOrigin = new URL(hostUrl).origin;
const facebookGroupUrl = process.env.ASYLUM_DESKTOP_FACEBOOK_URL ?? "https://www.facebook.com/";
let windowRef: BrowserWindow | null = null;
let hostView: WebContentsView | null = null;
let facebookView: WebContentsView | null = null;
let currentGameLink = "";
let currentFacebookPost = "";
let obsController: ObsController;
let obsSettings: ObsSettingsStore;
const viewStates = { host: "loading", facebook: "loading" } as Record<"host" | "facebook", "loading" | "ready" | "failed" | "crashed">;

function status(target: "host" | "facebook", state: "loading" | "ready" | "failed" | "crashed") {
  viewStates[target] = state;
  const view = target === "host" ? hostView : facebookView;
  view?.setVisible(state === "loading" || state === "ready");
  windowRef?.webContents.send("desktop:status", { target, state });
}

function track(view: WebContentsView, target: "host" | "facebook") {
  view.webContents.on("did-start-loading", () => status(target, "loading"));
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
    currentFacebookPost = candidate.facebookPost;
    return true;
  });
  const obsAction = (channel: string, action: (...args: unknown[]) => Promise<unknown> | unknown) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromShell(event)) return { ok: false, error: "Unauthorized request." };
      try { return { ok: true, value: await action(...args) }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "OBS request failed." }; }
    });
  };
  obsAction("obs:settings", () => obsSettings.load());
  obsAction("obs:state", () => obsController.getState());
  obsAction("obs:connect", async (payload) => {
    if (!payload || typeof payload !== "object") throw new Error("Invalid OBS connection settings.");
    const candidate = payload as ObsConnectConfig & { rememberSettings?: boolean };
    const saved = await obsSettings.load();
    const config = { host: candidate.host, port: candidate.port, password: candidate.password || (saved.config.host === candidate.host && saved.config.port === candidate.port ? saved.config.password : "") };
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
  obsController.subscribe((state) => windowRef?.webContents.send("obs:state-changed", state));
  registerIpc(); createWindow();
  app.on("activate", () => { if (BaseWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { void obsController?.disconnect(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
