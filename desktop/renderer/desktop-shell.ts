const shell = document.querySelector<HTMLElement>("#shell")!;
const hostRegion = document.querySelector<HTMLElement>("#host-region")!;
const facebookRegion = document.querySelector<HTMLElement>("#facebook-region")!;
const broadcastRegion = document.querySelector<HTMLElement>("#broadcast-region")!;
const divider = document.querySelector<HTMLElement>("#divider")!;
const facebookPanel = document.querySelector<HTMLElement>("#facebook-panel")!;
const obsPanel = document.querySelector<HTMLElement>("#obs-panel")!;
const broadcastPanel = document.querySelector<HTMLElement>("#broadcast-panel")!;
const hostError = document.querySelector<HTMLElement>("#host-error")!;
const facebookError = document.querySelector<HTMLElement>("#facebook-error")!;
const broadcastError = document.querySelector<HTMLElement>("#broadcast-error")!;
const obsApi = window.asylumDesktop?.obs;
const winnerApi = window.asylumDesktop?.winner;
let panel = (localStorage.getItem("desktop-panel") ?? "host") as "host" | "facebook" | "broadcast" | "obs";
const nativeStates: Record<"host" | "facebook" | "broadcast", DesktopStatus["state"]> = { host: "loading", facebook: "loading", broadcast: "loading" };
let currentObsState: ObsState | null = null;
let previewTimer: number | null = null;
let previewInFlight = false;
let previewScene: string | null = null;
const PREVIEW_INTERVAL_MS = 1_000;
const mappingKeys: ObsMappingKey[] = ["host", "wheel", "winner", "secondChance", "reward", "break", "ending"];
let sceneMappings: ObsSceneMappings = { scenes: { host: null, wheel: null, winner: null, secondChance: null, reward: null, break: null, ending: null }, automation: { enabled: false, spinToWheel: false, revealToWinner: false, secondChance: false, reward: false, acceptToHost: false, finishToEnding: false }, delays: { wheel: 0, winner: 1_000, secondChance: 1_000, reward: 1_000, host: 3_000 } };
let activeGameContext: ActiveGameContext | null = null;
let broadcastHealth: BroadcastHealth | null = null;
let broadcastFullscreen = false;

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
function rect(element: HTMLElement) { const value = element.getBoundingClientRect(); return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) }; }
function reportLayout() { void window.asylumDesktop.layout.update({ host: panel === "host" && !["failed","crashed"].includes(nativeStates.host) ? rect(hostRegion) : null, facebook: panel === "facebook" && !["failed","crashed"].includes(nativeStates.facebook) ? rect(facebookRegion) : null, broadcast: panel === "broadcast" && !["failed","crashed"].includes(nativeStates.broadcast) ? rect(broadcastRegion) : null }); }
function applyLayout() {
  hostRegion.hidden = panel !== "host"; facebookPanel.hidden = panel !== "facebook"; broadcastPanel.hidden = panel !== "broadcast"; obsPanel.hidden = panel !== "obs"; divider.hidden = true;
  localStorage.setItem("desktop-panel", panel); requestAnimationFrame(reportLayout);
  updatePreviewPolling();
}
const action = (id: string, callback: () => Promise<unknown>) => el(id).addEventListener("click", () => void callback());
action("back", window.asylumDesktop.facebook.back); action("forward", window.asylumDesktop.facebook.forward); action("reload", window.asylumDesktop.facebook.reload);
action("group", window.asylumDesktop.facebook.openGroup); action("external", window.asylumDesktop.facebook.openExternal);
action("copy-link", window.asylumDesktop.integration.copyGameLink); action("copy-post", window.asylumDesktop.integration.copyFacebookPost);
action("host-retry", window.asylumDesktop.host.retry); action("reload-host", window.asylumDesktop.host.reload); action("external-host", window.asylumDesktop.host.openExternal);
action("facebook-retry", window.asylumDesktop.facebook.retry); action("facebook-error-external", window.asylumDesktop.facebook.openExternal);
action("broadcast-retry", window.asylumDesktop.broadcast.retry);
function showObsLinkResult(result: ObsResult<string>, success: string) { if (!result.ok || !result.value) { el("obs-link-status").textContent = result.error ?? "OBS Broadcast URL is unavailable."; return; } el("obs-broadcast-url").textContent = result.value; el("obs-link-status").textContent = success; }
action("copy-obs-broadcast-url", async () => showObsLinkResult(await window.asylumDesktop.broadcast.copyObsUrl(), "Copied. This read-only URL does not require login."));
action("open-obs-broadcast-url", async () => showObsLinkResult(await window.asylumDesktop.broadcast.openObsUrl(), "Opened in the default browser."));
el("regenerate-obs-broadcast-url").addEventListener("click", async () => { if (!confirm("Regenerate broadcast link?\nThe current OBS URL will stop working.")) return; showObsLinkResult(await window.asylumDesktop.broadcast.regenerateObsUrl(), "New URL generated. Update the OBS Browser Source; the previous URL is now invalid."); });
el("select-active-game").addEventListener("click", async () => { const value = prompt("Enter the active game ID:")?.trim(); if (!value) return; const force = Boolean(activeGameContext?.locked && activeGameContext.gameId !== value); if (force && !confirm(`Active raffle is locked to ${activeGameContext?.raffleCode ?? activeGameContext?.gameId}. Switch anyway?`)) return; await window.asylumDesktop.activeGame.select(value, force); });
el("clear-active-game").addEventListener("click", () => { if (confirm("Clear the active raffle from Broadcast?")) void window.asylumDesktop.activeGame.clear(); });
el("lock-active-game").addEventListener("click", () => { if (activeGameContext) void window.asylumDesktop.activeGame.setLock(!activeGameContext.locked); });
action("clear-login", async () => { if (confirm("Clear the saved Facebook login and site data for this desktop app?")) await window.asylumDesktop.facebook.clearSession(); });
action("collapse", async () => { panel = "host"; applyLayout(); });
el("show-host").addEventListener("click", () => { panel = "host"; applyLayout(); });
el("show-facebook").addEventListener("click", () => { panel = "facebook"; applyLayout(); });
el("show-studio").addEventListener("click", () => { panel = "obs"; applyLayout(); });
el("show-broadcast").addEventListener("click", () => { panel = "broadcast"; applyLayout(); });

function setBroadcastFullscreen(value: boolean) { broadcastFullscreen = value; document.body.classList.toggle("broadcast-fullscreen", value); el("broadcast-fullscreen").hidden = value; el("broadcast-exit-fullscreen").hidden = !value; if (value) { panel = "broadcast"; applyLayout(); } else requestAnimationFrame(reportLayout); }
el("broadcast-fullscreen").addEventListener("click", () => setBroadcastFullscreen(true));
el("broadcast-exit-fullscreen").addEventListener("click", () => setBroadcastFullscreen(false));
function setCleanOutput(value: boolean) { document.body.classList.toggle("broadcast-clean", value); el<HTMLInputElement>("broadcast-clean").checked = value; el("broadcast-exit-clean").hidden = !value; requestAnimationFrame(reportLayout); }
el<HTMLInputElement>("broadcast-clean").addEventListener("change", (event) => setCleanOutput((event.currentTarget as HTMLInputElement).checked));
el("broadcast-exit-clean").addEventListener("click", () => setCleanOutput(false));
el<HTMLSelectElement>("broadcast-scale").addEventListener("change", (event) => { const raw = (event.currentTarget as HTMLSelectElement).value; const value = raw === "fit" ? "fit" : Number(raw) as 1 | 1.25 | 1.5; void window.asylumDesktop.broadcast.setScale(value); });
el<HTMLInputElement>("broadcast-safe-areas").addEventListener("change", (event) => { void window.asylumDesktop.broadcast.setSafeAreas((event.currentTarget as HTMLInputElement).checked); });

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
function renderSceneMappings(availableScenes: string[], connected: boolean) {
  const missing: string[] = [];
  for (const key of mappingKeys) {
    const select = el<HTMLSelectElement>(`mapping-${key}`);
    const selected = select.options.length ? select.value || null : sceneMappings.scenes[key];
    select.replaceChildren(new Option("Not assigned", ""), ...availableScenes.map((name) => new Option(name, name)));
    if (selected && !availableScenes.includes(selected)) {
      select.add(new Option(`${selected} (Missing)`, selected));
      if (connected) missing.push(selected);
    }
    select.value = selected ?? ""; select.disabled = !connected;
    el(`mapping-${key}-warning`).hidden = !(connected && selected && !availableScenes.includes(selected));
    const testButton = document.querySelector<HTMLButtonElement>(`[data-test-mapping="${key}"]`)!;
    testButton.disabled = !connected || !selected || !availableScenes.includes(selected);
  }
  const warning = el("mapping-warning"); warning.textContent = missing.length ? `Mapped scenes no longer exist in OBS: ${[...new Set(missing)].join(", ")}` : ""; warning.hidden = missing.length === 0;
  el<HTMLButtonElement>("save-scene-mappings").disabled = !connected;
  el("mapping-current-scene").textContent = currentObsState?.currentScene ?? "—";
  for (const key of ["host", "wheel", "winner"] as const) {
    const selected = el<HTMLSelectElement>(`mapping-${key}`).value;
    const node = el(`mapping-status-${key}`); node.textContent = `Mapped ${key[0].toUpperCase()}${key.slice(1)} Scene: ${selected || "—"}`; node.classList.toggle("matches", Boolean(selected && selected === currentObsState?.currentScene));
  }
}
function collectSceneMappings(): ObsSceneMappings {
  return {
    scenes: { host: el<HTMLSelectElement>("mapping-host").value || null, wheel: el<HTMLSelectElement>("mapping-wheel").value || null, winner: el<HTMLSelectElement>("mapping-winner").value || null, secondChance: el<HTMLSelectElement>("mapping-secondChance").value || null, reward: el<HTMLSelectElement>("mapping-reward").value || null, break: el<HTMLSelectElement>("mapping-break").value || null, ending: el<HTMLSelectElement>("mapping-ending").value || null },
    automation: { enabled: false, spinToWheel: el<HTMLInputElement>("automation-spin-wheel").checked, revealToWinner: el<HTMLInputElement>("automation-reveal-winner").checked, secondChance: el<HTMLInputElement>("automation-second-chance").checked, reward: el<HTMLInputElement>("automation-reward").checked, acceptToHost: el<HTMLInputElement>("automation-accept-host").checked, finishToEnding: el<HTMLInputElement>("automation-finish-ending").checked },
    delays: { wheel: Number(el<HTMLInputElement>("delay-wheel").value), winner: Number(el<HTMLInputElement>("delay-winner").value), secondChance: Number(el<HTMLInputElement>("delay-secondChance").value), reward: Number(el<HTMLInputElement>("delay-reward").value), host: Number(el<HTMLInputElement>("delay-host").value) },
  };
}
function applyAutomationSettings(settings: ObsSceneMappings) {
  el<HTMLInputElement>("automation-enabled").checked = false; el<HTMLInputElement>("automation-spin-wheel").checked = settings.automation.spinToWheel; el<HTMLInputElement>("automation-reveal-winner").checked = settings.automation.revealToWinner; el<HTMLInputElement>("automation-second-chance").checked = settings.automation.secondChance; el<HTMLInputElement>("automation-reward").checked = settings.automation.reward; el<HTMLInputElement>("automation-accept-host").checked = settings.automation.acceptToHost; el<HTMLInputElement>("automation-finish-ending").checked = settings.automation.finishToEnding;
  el<HTMLInputElement>("delay-wheel").value = String(settings.delays.wheel); el<HTMLInputElement>("delay-winner").value = String(settings.delays.winner); el<HTMLInputElement>("delay-secondChance").value = String(settings.delays.secondChance); el<HTMLInputElement>("delay-reward").value = String(settings.delays.reward); el<HTMLInputElement>("delay-host").value = String(settings.delays.host);
}
function renderAutomationStatus(status: ObsAutomationStatus) {
  el("automation-state").textContent = (status.pending ?? status.mode).replace("_", " ").toLowerCase().replace(/(^| )\w/g, (letter) => letter.toUpperCase());
  const log = el<HTMLOListElement>("automation-log");
  if (!status.log.length) { log.replaceChildren(Object.assign(document.createElement("li"), { textContent: "No automation events yet." })); return; }
  log.replaceChildren(...status.log.map((entry) => { const item = document.createElement("li"); const time = document.createElement("time"); time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); const message = document.createElement("span"); message.textContent = `${entry.message} · ${entry.sceneName}`; item.append(time, message); return item; }));
}
function renderAutomationRunning() {
  const connected = currentObsState?.connection === "CONNECTED";
  el("automation-running").textContent = sceneMappings.automation.enabled && connected ? "Running" : connected ? "Paused" : "OBS disconnected · Automation paused";
}
function renderObs(state: ObsState) {
  const sceneChanged = currentObsState?.currentScene !== state.currentScene;
  currentObsState = state;
  const connected = state.connection === "CONNECTED";
  const badge = el("obs-status"); badge.textContent = state.connection; badge.className = `status-pill ${state.connection.toLowerCase()}`;
  el("strip-obs").textContent = state.connection === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";
  el("obs-status-copy").textContent = state.connection === "CONNECTED" ? "Connected" : state.connection === "CONNECTING" ? "Connecting" : state.connection === "ERROR" ? "Error" : "Disconnected";
  el("obs-connect-form").hidden = connected; el("obs-controls").hidden = !connected;
  el("obs-program").textContent = state.currentScene || "—"; el("obs-stream").textContent = state.streaming ? "LIVE" : "OFF"; el("obs-record").textContent = state.recording ? "ON" : "OFF";
  el("automation-current-scene").textContent = state.currentScene || "—";
  renderAutomationRunning();
  el("preview-scene").textContent = state.currentScene || "—";
  if (sceneChanged && previewScene !== state.currentScene) setPreviewPlaceholder(connected ? "Updating preview…" : "OBS is not connected.", connected ? "Updating" : "OBS is not connected.");
  const scenes = el<HTMLSelectElement>("obs-scenes"); const selected = scenes.value; scenes.replaceChildren(...state.scenes.map((name) => new Option(name, name, false, name === (selected || state.currentScene))));
  renderSceneMappings(state.scenes, connected);
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
  const testMappedScene = async (key: ObsMappingKey) => {
    const sceneName = el<HTMLSelectElement>(`mapping-${key}`).value;
    if (!sceneName) { el("mapping-save-status").textContent = "Assign a scene first."; return; }
    const saved = unwrap(await obsApi.saveSceneMappings(collectSceneMappings())); if (!saved) return; sceneMappings = saved;
    const state = unwrap(await obsApi.testMappedScene(key)); if (state) renderObs(state);
  };
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-test-mapping]"))) button.addEventListener("click", () => void testMappedScene(button.dataset.testMapping as ObsMappingKey));
  for (const key of mappingKeys) el<HTMLSelectElement>(`mapping-${key}`).addEventListener("change", () => renderSceneMappings(currentObsState?.scenes ?? [], currentObsState?.connection === "CONNECTED"));
  el("save-scene-mappings").addEventListener("click", async () => {
    const saved = unwrap(await obsApi.saveSceneMappings(collectSceneMappings()));
    if (saved) { sceneMappings = saved; renderAutomationRunning(); el("mapping-save-status").textContent = "Saved locally."; }
  });
  el("export-studio-profile").addEventListener("click", async () => { const result = unwrap(await obsApi.exportStudioProfile()); if (result) el("mapping-save-status").textContent = result.exported ? "Studio profile exported." : "Export canceled."; });
  el("import-studio-profile").addEventListener("click", async () => {
    const result = unwrap(await obsApi.importStudioProfile()); if (!result) return;
    if (!result.imported || !result.mappings) { el("mapping-save-status").textContent = "Import canceled."; return; }
    sceneMappings = result.mappings;
    for (const key of mappingKeys) el<HTMLSelectElement>(`mapping-${key}`).replaceChildren();
    applyAutomationSettings(sceneMappings);
    renderAutomationRunning();
    renderSceneMappings(currentObsState?.scenes ?? [], currentObsState?.connection === "CONNECTED"); el("mapping-save-status").textContent = "Studio profile imported.";
  });
  obsApi.onStateChanged(renderObs);
  void obsApi.settings().then((result) => { const saved = unwrap(result); if (!saved) return; el<HTMLInputElement>("obs-host").value = saved.config.host; el<HTMLInputElement>("obs-port").value = String(saved.config.port); el<HTMLInputElement>("obs-remember").checked = saved.settings.rememberSettings; }).catch(() => showStudioFailure());
  void obsApi.getState().then((result) => { const state = unwrap(result); if (state) renderObs(state); }).catch(() => showStudioFailure());
  void obsApi.getSceneMappings().then((result) => {
    const saved = unwrap(result); if (!saved) return; sceneMappings = saved;
    applyAutomationSettings(saved);
    renderAutomationRunning();
    for (const key of mappingKeys) el<HTMLSelectElement>(`mapping-${key}`).replaceChildren();
    renderSceneMappings(currentObsState?.scenes ?? [], currentObsState?.connection === "CONNECTED");
  }).catch(() => { el("mapping-save-status").textContent = "Mappings could not be loaded."; });
  obsApi.onAutomationStateChanged(renderAutomationStatus);
  void obsApi.getAutomationStatus().then((result) => { const status = unwrap(result); if (status) renderAutomationStatus(status); });
} else showStudioFailure("OBS desktop bridge is unavailable. Restart the desktop application after rebuilding.");

if (winnerApi) {
  const applyWinner = (s: WinnerPresentationPublic) => { el<HTMLInputElement>("winner-enabled").checked=s.enabled; el<HTMLInputElement>("winner-confetti").checked=s.confetti; el<HTMLInputElement>("winner-sound").checked=s.sound; el<HTMLInputElement>("winner-volume").value=String(Math.round(s.volume*100)); el<HTMLInputElement>("winner-delay").value=String(s.overlayDelay); el<HTMLInputElement>("winner-duration").value=String(s.duration); };
  void winnerApi.getSettings().then((r) => { const s=unwrap(r); if(s) applyWinner(s); });
  el("winner-save").addEventListener("click", async()=>{const s=unwrap(await winnerApi.saveSettings({enabled:el<HTMLInputElement>("winner-enabled").checked,confetti:el<HTMLInputElement>("winner-confetti").checked,sound:el<HTMLInputElement>("winner-sound").checked,volume:Number(el<HTMLInputElement>("winner-volume").value)/100,overlayDelay:Number(el<HTMLInputElement>("winner-delay").value),duration:Number(el<HTMLInputElement>("winner-duration").value)}));if(s){applyWinner(s);el("winner-status").textContent="Saved locally."}});
  el("winner-choose-audio").addEventListener("click",async()=>{const s=unwrap(await winnerApi.chooseAudio());if(s){applyWinner(s);el("winner-status").textContent="Audio selected."}});
  el("winner-test").addEventListener("click",()=>void winnerApi.test("overlay")); el("winner-test-confetti").addEventListener("click",()=>void winnerApi.test("confetti")); el("winner-test-sound").addEventListener("click",()=>void winnerApi.test("sound")); el("winner-replay").addEventListener("click",()=>void winnerApi.replay()); el("winner-hide").addEventListener("click",()=>void winnerApi.hide());
}

function renderActiveGame(context: ActiveGameContext | null) { const changed = activeGameContext?.gameId !== context?.gameId; activeGameContext = context; el("broadcast-context").textContent = context ? `${context.locked ? "LOCKED TO" : "ACTIVE RAFFLE"} · ${context.raffleCode ?? context.gameId}${context.gameTitle ? ` · ${context.gameTitle}` : ""}` : "NO ACTIVE RAFFLE"; el("lock-active-game").textContent = context?.locked ? "Unlock" : "Lock Active Raffle"; el<HTMLButtonElement>("lock-active-game").disabled = !context; el("strip-raffle").textContent = context?.raffleCode ?? context?.gameId ?? "—"; if (!context) { el("obs-broadcast-url").textContent = "Select an active raffle to generate the read-only link."; return; } if (changed) void window.asylumDesktop.broadcast.getObsUrl().then((result) => showObsLinkResult(result, "Ready for OBS Browser Source · 1920×1080.")); }
function gameStateLabel(state: BroadcastHealth["state"]) { if (state === "COMPLETED") return "COMPLETE"; if (state === "READY") return "READY"; if (state === "WAITING") return "OPEN"; if (state === "ERROR") return "—"; return "IN PROGRESS"; }
function renderBroadcastHealth(health: BroadcastHealth) { broadcastHealth = health; el("strip-raffle").textContent = health.raffleCode ?? activeGameContext?.raffleCode ?? activeGameContext?.gameId ?? "—"; el("strip-state").textContent = health.gameState === "COMPLETED" ? "COMPLETE" : health.gameState?.replace("_", " ") ?? gameStateLabel(health.state); el("strip-wheel").textContent = health.wheelLabel ?? "—"; el("strip-broadcast").textContent = health.status === "live" ? "LIVE VIEW" : health.status === "error" ? "ERROR" : "WAITING"; }
function refreshHeartbeat() { const updated = broadcastHealth ? new Date(broadcastHealth.updatedAt).getTime() : 0; const age = updated ? Math.max(0, Math.floor((Date.now() - updated) / 1_000)) : null; el("broadcast-updated").textContent = `Broadcast Updated: ${age === null ? "—" : `${age}s ago`}`; el("broadcast-stale").hidden = age === null || age < 10; }
window.asylumDesktop.onStatus(({ target, state }) => { nativeStates[target] = state; (target === "host" ? hostError : target === "facebook" ? facebookError : broadcastError).hidden = state !== "failed" && state !== "crashed"; if (target === "broadcast" && state === "loading" && activeGameContext) el("broadcast-context").textContent = "Loading Broadcast..."; else if (target === "broadcast" && state === "ready") renderActiveGame(activeGameContext); reportLayout(); });
window.asylumDesktop.onActiveGame(renderActiveGame);
window.asylumDesktop.onBroadcastHealth(renderBroadcastHealth);
void window.asylumDesktop.activeGame.get().then(renderActiveGame);
void window.asylumDesktop.broadcast.getHealth().then((health) => { if (health) renderBroadcastHealth(health); });
window.setInterval(refreshHeartbeat, 1_000);
document.addEventListener("keydown", (event) => { const target = event.target as HTMLElement | null; if (target?.matches("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return; const key = event.key.toLowerCase(); if (event.key === "F11") { event.preventDefault(); setBroadcastFullscreen(!broadcastFullscreen); return; } const targetPanel = ({ b: "broadcast", h: "host", f: "facebook", s: "obs" } as const)[key]; if (targetPanel) { panel = targetPanel; applyLayout(); } });
window.addEventListener("resize", reportLayout); new ResizeObserver(reportLayout).observe(shell);
document.addEventListener("visibilitychange", updatePreviewPolling);
window.addEventListener("beforeunload", () => stopPreviewPolling());
void window.asylumDesktop.version().then((version) => { el("version").textContent = `Asylum Games Desktop ${version}`; });
applyLayout();
