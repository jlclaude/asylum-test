import { app, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ObsConnectConfig, ObsSceneMappings, ObsStoredSettings } from "./obs-types";
import { DEFAULT_OBS_SCENE_MAPPINGS, validateObsSceneMappings } from "./obs-scene-mappings";
import { OBS_DEFAULT_HOST, OBS_DEFAULT_PORT, validateObsConfig } from "./obs-validation";

type SettingsFile = {
  host?: string;
  port?: number;
  encryptedPassword?: string;
  sceneMappings?: ObsSceneMappings;
};

export class ObsSettingsStore {
  private sessionPassword: string | undefined;

  constructor(private readonly path = join(app.getPath("userData"), "obs-settings.json")) {}

  private async read(): Promise<SettingsFile> { try { return JSON.parse(await readFile(this.path, "utf8")) as SettingsFile; } catch { return {}; } }
  private async write(value: SettingsFile): Promise<void> { await writeFile(this.path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }

  async load(): Promise<{ config: ObsConnectConfig; settings: ObsStoredSettings }> {
    const stored = await this.read();
    let config = validateObsConfig({
      host: stored.host ?? OBS_DEFAULT_HOST,
      port: stored.port ?? OBS_DEFAULT_PORT,
    });
    let password: string | undefined;
    if (stored.encryptedPassword && safeStorage.isEncryptionAvailable()) {
      try { password = safeStorage.decryptString(Buffer.from(stored.encryptedPassword, "base64")); } catch { /* unusable credential */ }
    }
    password ??= this.sessionPassword;
    if (password) config = { ...config, password };
    return {
      config,
      settings: {
        host: config.host,
        port: config.port,
        rememberSettings: stored.host !== undefined && stored.port !== undefined,
        passwordStored: Boolean(stored.encryptedPassword && password),
      },
    };
  }

  async save(config: ObsConnectConfig, rememberSettings: boolean): Promise<void> {
    this.sessionPassword = config.password;
    const stored = await this.read();
    if (!rememberSettings) {
      delete stored.host; delete stored.port; delete stored.encryptedPassword;
      if (stored.sceneMappings) await this.write(stored); else await rm(this.path, { force: true });
      return;
    }
    stored.host = config.host; stored.port = config.port; delete stored.encryptedPassword;
    if (config.password && safeStorage.isEncryptionAvailable()) {
      stored.encryptedPassword = safeStorage.encryptString(config.password).toString("base64");
    }
    await this.write(stored);
  }

  async loadSceneMappings(): Promise<ObsSceneMappings> {
    const stored = await this.read();
    try { return stored.sceneMappings ? validateObsSceneMappings(stored.sceneMappings) : structuredClone(DEFAULT_OBS_SCENE_MAPPINGS); }
    catch { return structuredClone(DEFAULT_OBS_SCENE_MAPPINGS); }
  }

  async saveSceneMappings(value: ObsSceneMappings): Promise<void> {
    const stored = await this.read(); stored.sceneMappings = value; await this.write(stored);
  }
}
