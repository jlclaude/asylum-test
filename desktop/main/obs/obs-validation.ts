import type { ObsConnectConfig } from "./obs-types";

export const OBS_DEFAULT_HOST = "127.0.0.1";
export const OBS_DEFAULT_PORT = 4455;
const LOCAL_OBS_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function validateObsConfig(value: unknown): ObsConnectConfig {
  if (!value || typeof value !== "object") throw new Error("OBS connection settings are invalid.");
  const candidate = value as Record<string, unknown>;
  const host = String(candidate.host ?? "").trim().toLowerCase();
  const port = Number(candidate.port);
  const password = candidate.password;
  if (!LOCAL_OBS_HOSTS.has(host)) {
    throw new Error("OBS connections are limited to this computer.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("OBS port must be a whole number from 1 to 65535.");
  }
  if (password !== undefined && typeof password !== "string") {
    throw new Error("OBS password is invalid.");
  }
  if (typeof password === "string" && password.length > 1_000) {
    throw new Error("OBS password is too long.");
  }
  return { host, port, ...(password ? { password } : {}) };
}

export function validateSceneName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    throw new Error("Select a valid OBS scene.");
  }
  return value;
}

export function obsWebSocketUrl(config: ObsConnectConfig): string {
  const host = config.host === "::1" ? "[::1]" : config.host;
  return `ws://${host}:${config.port}`;
}

export function normalizeSceneList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value.flatMap((scene) => {
    if (!scene || typeof scene !== "object") return [];
    const name = (scene as Record<string, unknown>).sceneName;
    return typeof name === "string" && name.trim() ? [name] : [];
  });
  return [...new Set(names)];
}
