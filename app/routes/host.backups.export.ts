import type { LoaderFunctionArgs } from "react-router";
import {
  requireHostPermission,
  hostSessionSecurity,
} from "../lib/host-auth.server";
import { verifyHostCsrfToken } from "../lib/host-csrf.server";
import {
  createClaimsCsv,
  createEmergencyBackup,
  createPrizeClaimsCsv,
  createRaffleJson,
  createWinnersCsv,
} from "../services/backup.server";
function download(body: string, type: string, name: string) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "backups:manage");
  const session = await hostSessionSecurity(request);
  const url = new URL(request.url);
  verifyHostCsrfToken(
    url.searchParams.get("csrf") ?? "",
    session.csrfTokenHash,
  );
  const type = url.searchParams.get("type");
  const gameId = url.searchParams.get("gameId") ?? undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (type === "backup")
    return download(
      JSON.stringify(await createEmergencyBackup(host.shop), null, 2),
      "application/json",
      `asylum-backup-${stamp}.json`,
    );
  if (type === "raffle-json" && gameId)
    return download(
      JSON.stringify(await createRaffleJson(host.shop, gameId), null, 2),
      "application/json",
      `raffle-${stamp}.json`,
    );
  if (type === "claims-csv")
    return download(
      await createClaimsCsv(host.shop, gameId),
      "text/csv",
      `claims-${stamp}.csv`,
    );
  if (type === "winners-csv")
    return download(
      await createWinnersCsv(host.shop, gameId),
      "text/csv",
      `winners-${stamp}.csv`,
    );
  if (type === "prize-claims-csv")
    return download(
      await createPrizeClaimsCsv(host.shop),
      "text/csv",
      `prize-claims-private-${stamp}.csv`,
    );
  throw new Response("Unknown export type.", { status: 400 });
}
