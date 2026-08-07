import { shell, type WebContents } from "electron";

export const ASYLUM_ORIGIN = "https://asylum-test.onrender.com";
const FACEBOOK_HOSTS = ["facebook.com", "fb.com", "fbcdn.net", "messenger.com", "meta.com"];

export function isSafeHttps(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function isAsylumUrl(rawUrl: string, configuredOrigin: string): boolean {
  try {
    const url = new URL(rawUrl);
    const configured = new URL(configuredOrigin);
    const loopbackDevelopment = configured.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(configured.hostname);
    return (configured.protocol === "https:" || loopbackDevelopment) && url.origin === configured.origin;
  } catch {
    return false;
  }
}

export function isFacebookUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && FACEBOOK_HOSTS.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function openExternalHttps(rawUrl: string): void {
  if (isSafeHttps(rawUrl)) void shell.openExternal(rawUrl);
}

export function restrictNavigation(
  contents: WebContents,
  isAllowed: (url: string) => boolean,
): void {
  contents.on("will-navigate", (event, url) => {
    if (isAllowed(url)) return;
    event.preventDefault();
    openExternalHttps(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    openExternalHttps(url);
    return { action: "deny" };
  });
}

export function denyPermissions(contents: WebContents): void {
  const controlledSession = contents.session;
  controlledSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  controlledSession.setPermissionCheckHandler(() => false);
}
