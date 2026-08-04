import type { LoaderFunctionArgs } from "react-router";
import {
  createClaimsCsv,
  createEmergencyBackup,
  createPrizeClaimsCsv,
  createRaffleJson,
  createWinnersCsv,
} from "../services/backup.server";
import { authenticate } from "../shopify.server";

function safeFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "shop";
}

function download(body: string, contentType: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const gameId = url.searchParams.get("gameId")?.trim() || undefined;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shop = safeFilenamePart(session.shop);

  if (type === "backup") {
    const backup = await createEmergencyBackup(session.shop);
    return download(JSON.stringify(backup, null, 2), "application/json; charset=utf-8", `asylum-games-backup-${shop}-${timestamp}.json`);
  }
  if (type === "raffle-json") {
    if (!gameId) throw new Response("Raffle ID is required.", { status: 400 });
    const raffle = await createRaffleJson(session.shop, gameId);
    return download(JSON.stringify(raffle, null, 2), "application/json; charset=utf-8", `asylum-raffle-${shop}-${timestamp}.json`);
  }
  if (type === "claims-csv") {
    return download(await createClaimsCsv(session.shop, gameId), "text/csv; charset=utf-8", `asylum-claims-${shop}-${timestamp}.csv`);
  }
  if (type === "winners-csv") {
    return download(await createWinnersCsv(session.shop, gameId), "text/csv; charset=utf-8", `asylum-winners-${shop}-${timestamp}.csv`);
  }
  if (type === "prize-claims-csv") {
    return download(await createPrizeClaimsCsv(session.shop), "text/csv; charset=utf-8", `asylum-prize-claims-private-${shop}-${timestamp}.csv`);
  }
  throw new Response("Unknown export type.", { status: 400 });
}
