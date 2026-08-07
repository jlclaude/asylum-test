import { WebContentsView, session } from "electron";
import { denyPermissions, isFacebookUrl, restrictNavigation } from "./security";

export const FACEBOOK_PARTITION = "persist:asylum-facebook";

export function createFacebookView(): WebContentsView {
  const facebookSession = session.fromPartition(FACEBOOK_PARTITION);
  const view = new WebContentsView({
    webPreferences: {
      session: facebookSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.setBackgroundColor("#11151b");
  restrictNavigation(view.webContents, isFacebookUrl);
  denyPermissions(view.webContents);
  return view;
}

export async function clearFacebookSession(): Promise<void> {
  const facebookSession = session.fromPartition(FACEBOOK_PARTITION);
  await facebookSession.clearStorageData();
  await facebookSession.clearCache();
}
