import type { WebContents } from "electron";

export async function navigate(contents: WebContents, url: string): Promise<void> {
  await contents.loadURL(url);
}

export function goBack(contents: WebContents): void {
  if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
}

export function goForward(contents: WebContents): void {
  if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
}
