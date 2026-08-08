import { app } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ActiveGameContext = { gameId: string; sourceUrl: string; broadcastUrl: string; raffleCode: string | null; gameTitle: string | null; hostCsrfToken: string | null; locked: boolean };
const GAME_ID = /^[A-Za-z0-9_-]{8,200}$/;

export function validGameId(value: unknown): value is string { return typeof value === "string" && value !== "new" && GAME_ID.test(value); }
export function broadcastUrlFor(gameId: string, trustedOrigin: string) { return `${trustedOrigin}/host/games/${encodeURIComponent(gameId)}/broadcast`; }
export function activeGameFromHostUrl(rawUrl: string, trustedOrigin: string): ActiveGameContext | null {
  try {
    const url = new URL(rawUrl); if (url.origin !== trustedOrigin) return null;
    const match = url.pathname.match(/^\/host\/games\/([^/]+)(?:\/(?:play|broadcast))?\/?$/); if (!match) return null;
    const gameId = decodeURIComponent(match[1]); if (!validGameId(gameId)) return null;
    return { gameId, sourceUrl: url.href, broadcastUrl: broadcastUrlFor(gameId, trustedOrigin), raffleCode: null, gameTitle: null, hostCsrfToken: null, locked: false };
  } catch { return null; }
}

export class ActiveGameStore {
  constructor(private readonly path = join(app.getPath("userData"), "active-game.json")) {}
  async load(trustedOrigin: string): Promise<ActiveGameContext | null> { try { const value = JSON.parse(await readFile(this.path, "utf8")) as { gameId?: unknown; locked?: unknown }; return validGameId(value.gameId) ? { gameId: value.gameId, sourceUrl: "desktop-restore", broadcastUrl: broadcastUrlFor(value.gameId, trustedOrigin), raffleCode: null, gameTitle: null, hostCsrfToken: null, locked: value.locked === true } : null; } catch { return null; } }
  async save(context: ActiveGameContext) { await writeFile(this.path, `${JSON.stringify({ gameId: context.gameId, locked: context.locked })}\n`, { mode: 0o600 }); }
  async clear() { await rm(this.path, { force: true }); }
}
