import { app, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ObsConnectConfig, ObsStoredSettings } from "./obs-types";
import { OBS_DEFAULT_HOST, OBS_DEFAULT_PORT, validateObsConfig } from "./obs-validation";

type SettingsFile = {
  host: string;
  port: number;
  encryptedPassword?: string;
};

export class ObsSettingsStore {
  private sessionPassword: string | undefined;

  constructor(private readonly path = join(app.getPath("userData"), "obs-settings.json")) {}

  async load(): Promise<{ config: ObsConnectConfig; settings: ObsStoredSettings }> {
    let stored: SettingsFile | null = null;
    try { stored = JSON.parse(await readFile(this.path, "utf8")) as SettingsFile; } catch { /* defaults */ }
    let config = validateObsConfig({
      host: stored?.host ?? OBS_DEFAULT_HOST,
      port: stored?.port ?? OBS_DEFAULT_PORT,
    });
    let password: string | undefined;
    if (stored?.encryptedPassword && safeStorage.isEncryptionAvailable()) {
      try { password = safeStorage.decryptString(Buffer.from(stored.encryptedPassword, "base64")); } catch { /* unusable credential */ }
    }
    password ??= this.sessionPassword;
    if (password) config = { ...config, password };
    return {
      config,
      settings: {
        host: config.host,
        port: config.port,
        rememberSettings: Boolean(stored),
        passwordStored: Boolean(stored?.encryptedPassword && password),
      },
    };
  }

  async save(config: ObsConnectConfig, rememberSettings: boolean): Promise<void> {
    this.sessionPassword = config.password;
    if (!rememberSettings) {
      await rm(this.path, { force: true });
      return;
    }
    const stored: SettingsFile = { host: config.host, port: config.port };
    if (config.password && safeStorage.isEncryptionAvailable()) {
      stored.encryptedPassword = safeStorage.encryptString(config.password).toString("base64");
    }
    await writeFile(this.path, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  }
}
