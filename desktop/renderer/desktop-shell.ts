const shell = document.querySelector<HTMLElement>("#shell")!;
const hostRegion = document.querySelector<HTMLElement>("#host-region")!;
const facebookRegion = document.querySelector<HTMLElement>("#facebook-region")!;
const divider = document.querySelector<HTMLElement>("#divider")!;
const facebookPanel = document.querySelector<HTMLElement>("#facebook-panel")!;
const hostError = document.querySelector<HTMLElement>("#host-error")!;
const facebookError = document.querySelector<HTMLElement>("#facebook-error")!;
let collapsed = localStorage.getItem("facebook-collapsed") === "true";
let ratio = Number(localStorage.getItem("facebook-ratio") ?? "0.4");

function rect(element: HTMLElement) {
  const value = element.getBoundingClientRect();
  return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) };
}

function reportLayout() {
  void window.asylumDesktop.layout.update({ host: rect(hostRegion), facebook: collapsed ? null : rect(facebookRegion) });
}

function applyLayout() {
  document.body.classList.toggle("collapsed", collapsed);
  document.querySelector("#collapse")!.textContent = collapsed ? "Expand" : "Collapse";
  if (!collapsed) shell.style.gridTemplateRows = `42px minmax(120px, ${1 - ratio}fr) 7px minmax(170px, ${ratio}fr)`;
  requestAnimationFrame(reportLayout);
}

divider.addEventListener("pointerdown", (start) => {
  divider.setPointerCapture(start.pointerId);
  const move = (event: PointerEvent) => {
    const available = window.innerHeight - 49;
    ratio = Math.min(0.7, Math.max(0.2, (window.innerHeight - event.clientY) / available));
    localStorage.setItem("facebook-ratio", String(ratio));
    applyLayout();
  };
  divider.addEventListener("pointermove", move);
  divider.addEventListener("pointerup", () => divider.removeEventListener("pointermove", move), { once: true });
});

const action = (id: string, callback: () => Promise<unknown>) => document.querySelector(`#${id}`)!.addEventListener("click", () => void callback());
action("back", window.asylumDesktop.facebook.back);
action("forward", window.asylumDesktop.facebook.forward);
action("reload", window.asylumDesktop.facebook.reload);
action("group", window.asylumDesktop.facebook.openGroup);
action("external", window.asylumDesktop.facebook.openExternal);
action("copy-link", window.asylumDesktop.integration.copyGameLink);
action("copy-post", window.asylumDesktop.integration.copyFacebookPost);
action("host-retry", window.asylumDesktop.host.retry);
action("facebook-retry", window.asylumDesktop.facebook.retry);
action("facebook-error-external", window.asylumDesktop.facebook.openExternal);
action("clear-login", async () => {
  if (confirm("Clear the saved Facebook login and site data for this desktop app?")) await window.asylumDesktop.facebook.clearSession();
});
action("collapse", async () => {
  collapsed = !collapsed;
  localStorage.setItem("facebook-collapsed", String(collapsed));
  applyLayout();
});

window.asylumDesktop.onStatus(({ target, state }) => {
  const error = target === "host" ? hostError : facebookError;
  error.hidden = state !== "failed" && state !== "crashed";
});
window.addEventListener("resize", reportLayout);
new ResizeObserver(reportLayout).observe(facebookPanel);
void window.asylumDesktop.version().then((version) => { document.querySelector("#version")!.textContent = `Asylum Games Desktop ${version}`; });
applyLayout();
