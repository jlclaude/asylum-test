const shell = document.querySelector<HTMLElement>("#shell")!;
const hostRegion = document.querySelector<HTMLElement>("#host-region")!;
const facebookRegion = document.querySelector<HTMLElement>("#facebook-region")!;
const divider = document.querySelector<HTMLElement>("#divider")!;
const facebookPanel = document.querySelector<HTMLElement>("#facebook-panel")!;
const obsPanel = document.querySelector<HTMLElement>("#obs-panel")!;
const hostError = document.querySelector<HTMLElement>("#host-error")!;
const facebookError = document.querySelector<HTMLElement>("#facebook-error")!;
const obsApi = window.asylumDesktop?.obs;
let panel = (localStorage.getItem("desktop-panel") ?? "facebook") as "host" | "facebook" | "obs";
let ratio = Number(localStorage.getItem("desktop-panel-ratio") ?? "0.4");
let currentObsState: ObsState | null = null;
let previewTimer: number | null = null;
let previewInFlight = false;
let previewScene: string | null = null;
const PREVIEW_INTERVAL_MS = 1_000;

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
function rect(element: HTMLElement) { const value = element.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) }; }
function reportLayout() { void window.asylumDesktop.layout.update({ host: rect(hostRegion), facebook: panel === "facebook" ? rect(facebookRegion) : null }); }
function applyLayout() {
  const open = panel !== "host";
  facebookPanel.hidden = panel !== "facebook"; obsPanel.hidden = panel !== "obs"; divider.hidden = !open;
  shell.style.gridTemplateRows = open ? `54px minmax(120px, ${1 - ratio}fr) 7px minmax(260px, ${ratio}fr)` : "54px minmax(120px, 1fr) 0 0";
  localStorage.setItem("desktop-panel", panel); requestAnimationFrame(reportLayout);
  updatePreviewPolling();
}
divider.addEventListener("pointerdown", (start) => {
  divider.setPointerCapture(start.pointerId);
  const move = (event: PointerEvent) => { ratio = Math.min(.7, Math.max(.25, (innerHeight - event.clientY) / (innerHeight - 61))); localStorage.setItem("desktop-panel-ratio", String(ratio)); applyLayout(); };
  divider.addEventListener("pointermove", move); divider.addEventListener("pointerup", () => divider.removeEventListener("pointermove", move), { once: true });
});
const action = (id: string, callback: () => Promise<unknown>) => el(id).addEventListener("click", () => void callback());
action("back", window.asylumDesktop.facebook.back); action("forward", window.asylumDesktop.facebook.forward); action("reload", window.asylumDesktop.facebook.reload);
action("group", window.asylumDesktop.facebook.openGroup); action("external", window.asylumDesktop.facebook.openExternal);
action("copy-link", window.asylumDesktop.integration.copyGameLink); action("copy-post", window.asylumDesktop.integration.copyFacebookPost);
action("host-retry", window.asylumDesktop.host.retry); action("reload-host", window.asylumDesktop.host.reload); action("external-host", window.asylumDesktop.host.openExternal);
action("facebook-retry", window.asylumDesktop.facebook.retry); action("facebook-error-external", window.asylumDesktop.facebook.openExternal);
action("clear-login", async () => { if (confirm("Clear the saved Facebook login and site data for this desktop app?")) await window.asylumDesktop.facebook.clearSession(); });
action("collapse", async () => { panel = "host"; applyLayout(); });
el("show-host").addEventListener("click", () => { panel = "host"; applyLayout(); });
el("show-facebook").addEventListener("click", () => { panel = "facebook"; applyLayout(); });
el("show-studio").addEventListener("click", () => { panel = "obs"; applyLayout(); });

function unwrap<T>(result: ObsResult<T>): T | undefined { if (!result.ok) { showObsError(result.error ?? "OBS request failed."); return; } return result.value; }
function showObsError(message?: string) { const node = el("obs-error"); node.textContent = message ?? ""; node.hidden = !message; }
function showStudioFailure(message = "OBS controls could not be loaded.") {
  el("studio-error-message").textContent = message;
  el("studio-error").hidden = false;
  el("obs-panel").querySelector<HTMLElement>(".obs-content")!.hidden = true;
}
function setPreviewPlaceholder(message: string, status = message) {
  const image = el<HTMLImageElement>("program-preview-image");
  image.hidden = true; image.removeAttribute("src");
  el("program-preview-placeholder").hidden = false; el("program-preview-placeholder").textContent = message;
  el("preview-status").textContent = status;
}
function previewShouldRun() { return Boolean(obsApi && panel === "obs" && document.visibilityState === "visible" && currentObsState?.connection === "CONNECTED"); }
function previewByteLength(dataUrl: string) { const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1); return Math.max(0, Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)); }
async function requestPreviewFrame(diagnostic = false) {
  if (!previewShouldRun() || previewInFlight || !obsApi) return;
  previewInFlight = true; el("preview-status").textContent = "Updating";
  try {
    const result = diagnostic ? await obsApi.testProgramPreview() : await obsApi.getProgramPreview();
    if (!previewShouldRun()) return;
    if (!result.ok || !result.value?.imageDataUrl) {
      const message = result.error === "Preview source unavailable." ? result.error : "Preview unavailable\nOBS is connected, but no preview frame was returned.";
      setPreviewPlaceholder(message, "Error"); return;
    }
    const candidate = new Image();
    await new Promise<void>((resolve, reject) => { candidate.onload = () => resolve(); candidate.onerror = () => reject(new Error("invalid preview image")); candidate.src = result.value!.imageDataUrl!; });
    if (!previewShouldRun()) return;
    const image = el<HTMLImageElement>("program-preview-image");
    image.src = candidate.src; image.hidden = false; el("program-preview-placeholder").hidden = true;
    previewScene = result.value.sceneName; el("preview-scene").textContent = previewScene ?? "—"; el("preview-status").textContent = "Live";
    el("preview-bytes").textContent = String(previewByteLength(result.value.imageDataUrl)); el("preview-source").textContent = previewScene ?? "—"; el("preview-last-frame").textContent = new Date().toLocaleTimeString();
  } catch { if (previewShouldRun()) setPreviewPlaceholder("Preview unavailable\nOBS is connected, but no preview frame was returned.", "Error"); }
  finally { previewInFlight = false; }
}
function stopPreviewPolling(message = "Preview paused.") {
  if (previewTimer !== null) window.clearInterval(previewTimer);
  previewTimer = null;
  if (currentObsState?.connection !== "CONNECTED") setPreviewPlaceholder("OBS is not connected.");
  else setPreviewPlaceholder(message);
}
function updatePreviewPolling() {
  if (!previewShouldRun()) { stopPreviewPolling(); return; }
  if (previewTimer === null) {
    void requestPreviewFrame();
    previewTimer = window.setInterval(() => void requestPreviewFrame(), PREVIEW_INTERVAL_MS);
  }
}
function renderObs(state: ObsState) {
  const sceneChanged = currentObsState?.currentScene !== state.currentScene;
  currentObsState = state;
  const connected = state.connection === "CONNECTED";
  const badge = el("obs-status"); badge.textContent = state.connection; badge.className = `status-pill ${state.connection.toLowerCase()}`;
  el("obs-status-copy").textContent = state.connection === "CONNECTED" ? "Connected" : state.connection === "CONNECTING" ? "Connecting" : state.connection === "ERROR" ? "Error" : "Disconnected";
  el("obs-connect-form").hidden = connected; el("obs-controls").hidden = !connected;
  el("obs-program").textContent = state.currentScene || "—"; el("obs-stream").textContent = state.streaming ? "LIVE" : "OFF"; el("obs-record").textContent = state.recording ? "ON" : "OFF";
  el("preview-scene").textContent = state.currentScene || "—";
  if (sceneChanged && previewScene !== state.currentScene) setPreviewPlaceholder(connected ? "Updating preview…" : "OBS is not connected.", connected ? "Updating" : "OBS is not connected.");
  const scenes = el<HTMLSelectElement>("obs-scenes"); const selected = scenes.value; scenes.replaceChildren(...state.scenes.map((name) => new Option(name, name, false, name === (selected || state.currentScene))));
  el<HTMLButtonElement>("obs-start-stream").disabled = state.streaming; el<HTMLButtonElement>("obs-stop-stream").disabled = !state.streaming;
  el<HTMLButtonElement>("obs-start-recording").disabled = state.recording; el<HTMLButtonElement>("obs-stop-recording").disabled = !state.recording;
  showObsError(state.lastError ?? undefined);
  updatePreviewPolling();
}
el("studio-retry").addEventListener("click", () => location.reload());
if (obsApi) {
  el<HTMLFormElement>("obs-connect-form").addEventListener("submit", async (event) => {
    event.preventDefault(); showObsError();
    try {
      const result = await obsApi.connect({ host: el<HTMLInputElement>("obs-host").value, port: Number(el<HTMLInputElement>("obs-port").value), password: el<HTMLInputElement>("obs-password").value, rememberSettings: el<HTMLInputElement>("obs-remember").checked });
      const state = unwrap(result); if (state) { el<HTMLInputElement>("obs-password").value = ""; renderObs(state); }
    } catch { showStudioFailure(); }
  });
  action("obs-disconnect", async () => { const state = unwrap(await obsApi.disconnect()); if (state) renderObs(state); });
  action("obs-refresh", async () => { const state = unwrap(await obsApi.refresh()); if (state) renderObs(state); });
  el<HTMLSelectElement>("obs-scenes").addEventListener("change", async (event) => { const state = unwrap(await obsApi.switchScene((event.currentTarget as HTMLSelectElement).value)); if (state) renderObs(state); });
  action("obs-start-stream", async () => { const state = unwrap(await obsApi.startStream()); if (state) renderObs(state); });
  action("obs-stop-stream", async () => { if (!confirm("Stop the live stream?")) return; const state = unwrap(await obsApi.stopStream()); if (state) renderObs(state); });
  action("obs-start-recording", async () => { const state = unwrap(await obsApi.startRecording()); if (state) renderObs(state); });
  action("obs-stop-recording", async () => { if (!confirm("Stop recording?")) return; const state = unwrap(await obsApi.stopRecording()); if (state) renderObs(state); });
  el("test-preview").addEventListener("click", () => void requestPreviewFrame(true));
  obsApi.onStateChanged(renderObs);
  void obsApi.settings().then((result) => { const saved = unwrap(result); if (!saved) return; el<HTMLInputElement>("obs-host").value = saved.config.host; el<HTMLInputElement>("obs-port").value = String(saved.config.port); el<HTMLInputElement>("obs-remember").checked = saved.settings.rememberSettings; }).catch(() => showStudioFailure());
  void obsApi.getState().then((result) => { const state = unwrap(result); if (state) renderObs(state); }).catch(() => showStudioFailure());
} else showStudioFailure("OBS desktop bridge is unavailable. Restart the desktop application after rebuilding.");

window.asylumDesktop.onStatus(({ target, state }) => { (target === "host" ? hostError : facebookError).hidden = state !== "failed" && state !== "crashed"; });
window.addEventListener("resize", reportLayout); new ResizeObserver(reportLayout).observe(shell);
document.addEventListener("visibilitychange", updatePreviewPolling);
window.addEventListener("beforeunload", () => stopPreviewPolling());
void window.asylumDesktop.version().then((version) => { el("version").textContent = `Asylum Games Desktop ${version}`; });
applyLayout();
