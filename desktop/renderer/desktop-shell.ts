const shell = document.querySelector<HTMLElement>("#shell")!;
const hostRegion = document.querySelector<HTMLElement>("#host-region")!;
const facebookRegion = document.querySelector<HTMLElement>("#facebook-region")!;
const divider = document.querySelector<HTMLElement>("#divider")!;
const facebookPanel = document.querySelector<HTMLElement>("#facebook-panel")!;
const obsPanel = document.querySelector<HTMLElement>("#obs-panel")!;
const hostError = document.querySelector<HTMLElement>("#host-error")!;
const facebookError = document.querySelector<HTMLElement>("#facebook-error")!;
let panel = (localStorage.getItem("desktop-panel") ?? "facebook") as "host" | "facebook" | "obs";
let ratio = Number(localStorage.getItem("desktop-panel-ratio") ?? "0.4");
let obsState: ObsState | null = null;

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
function rect(element: HTMLElement) { const value = element.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) }; }
function reportLayout() { void window.asylumDesktop.layout.update({ host: rect(hostRegion), facebook: panel === "facebook" ? rect(facebookRegion) : null }); }
function applyLayout() {
  const open = panel !== "host";
  facebookPanel.hidden = panel !== "facebook"; obsPanel.hidden = panel !== "obs"; divider.hidden = !open;
  shell.style.gridTemplateRows = open ? `54px minmax(120px, ${1 - ratio}fr) 7px minmax(260px, ${ratio}fr)` : "54px minmax(120px, 1fr) 0 0";
  localStorage.setItem("desktop-panel", panel); requestAnimationFrame(reportLayout);
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
function renderObs(state: ObsState) {
  obsState = state; const connected = state.connection === "CONNECTED";
  const badge = el("obs-status"); badge.textContent = state.connection; badge.className = `status-pill ${state.connection.toLowerCase()}`;
  el("obs-connect-form").hidden = connected; el("obs-controls").hidden = !connected;
  el("obs-program").textContent = state.currentScene || "—"; el("obs-stream").textContent = state.streaming ? "LIVE" : "OFF"; el("obs-record").textContent = state.recording ? "ON" : "OFF";
  const scenes = el<HTMLSelectElement>("obs-scenes"); const selected = scenes.value; scenes.replaceChildren(...state.scenes.map((name) => new Option(name, name, false, name === (selected || state.currentScene))));
  el("obs-stream-toggle").textContent = state.streaming ? "Stop stream" : "Start stream"; el("obs-record-toggle").textContent = state.recording ? "Stop recording" : "Start recording";
  showObsError(state.lastError ?? undefined);
}
el<HTMLFormElement>("obs-connect-form").addEventListener("submit", async (event) => {
  event.preventDefault(); showObsError();
  const result = await window.asylumDesktop.obs.connect({ host: el<HTMLInputElement>("obs-host").value, port: Number(el<HTMLInputElement>("obs-port").value), password: el<HTMLInputElement>("obs-password").value, rememberSettings: el<HTMLInputElement>("obs-remember").checked });
  const state = unwrap(result); if (state) { el<HTMLInputElement>("obs-password").value = ""; renderObs(state); }
});
action("obs-disconnect", async () => { const state = unwrap(await window.asylumDesktop.obs.disconnect()); if (state) renderObs(state); });
action("obs-refresh", async () => { const state = unwrap(await window.asylumDesktop.obs.refresh()); if (state) renderObs(state); });
action("obs-switch", async () => { const state = unwrap(await window.asylumDesktop.obs.switchScene(el<HTMLSelectElement>("obs-scenes").value)); if (state) renderObs(state); });
action("obs-stream-toggle", async () => { if (!obsState) return; if (obsState.streaming && !confirm("Stop the live stream?")) return; const result = obsState.streaming ? await window.asylumDesktop.obs.stopStream() : await window.asylumDesktop.obs.startStream(); const state = unwrap(result); if (state) renderObs(state); });
action("obs-record-toggle", async () => { if (!obsState) return; if (obsState.recording && !confirm("Stop recording?")) return; const result = obsState.recording ? await window.asylumDesktop.obs.stopRecording() : await window.asylumDesktop.obs.startRecording(); const state = unwrap(result); if (state) renderObs(state); });

window.asylumDesktop.onStatus(({ target, state }) => { (target === "host" ? hostError : facebookError).hidden = state !== "failed" && state !== "crashed"; });
window.asylumDesktop.obs.onStateChanged(renderObs);
window.addEventListener("resize", reportLayout); new ResizeObserver(reportLayout).observe(shell);
void window.asylumDesktop.version().then((version) => { el("version").textContent = `Asylum Games Desktop ${version}`; });
void window.asylumDesktop.obs.settings().then((result) => { const saved = unwrap(result); if (!saved) return; el<HTMLInputElement>("obs-host").value = saved.config.host; el<HTMLInputElement>("obs-port").value = String(saved.config.port); el<HTMLInputElement>("obs-remember").checked = saved.settings.rememberSettings; });
void window.asylumDesktop.obs.state().then((result) => { const state = unwrap(result); if (state) renderObs(state); });
applyLayout();
