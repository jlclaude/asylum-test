import { validBroadcastToken } from "./broadcast-token.server";
import { getBroadcastState } from "../models/broadcast.server";

export async function loadReadOnlyBroadcast(gameId: string, token: string) {
  if (!gameId || !await validBroadcastToken(gameId, token)) return { broadcast: null, error: "INVALID_LINK" as const };
  try { const broadcast = await getBroadcastState(gameId); return { broadcast, error: broadcast ? null : "INVALID_LINK" as const }; }
  catch { return { broadcast: null, error: "UNAVAILABLE" as const }; }
}
