import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { getHostAdminContext } from "../lib/host-shopify.server";
import {
  handleGameModeAction,
  loadGameModeData,
} from "../services/game-mode.server";
import GameModePage, { ErrorBoundary } from "./app.games.$id_.play";
import { recordHostAuditEvent } from "../models/host-audit.server";
import type { GameControlRouteMode } from "../lib/game-control-routes";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "wheels:operate");
  if (!params.id) throw new Response("Game ID is required.", { status: 400 });
  return {
    ...(await loadGameModeData(params.id, host.shop)),
    csrfToken: host.csrfToken,
    routeMode: "HOST_PORTAL" as GameControlRouteMode,
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) return { error: "Game ID is missing." };
  const formData = await request.clone().formData();
  const intent = String(formData.get("intent") ?? "");
  const wheelId = String(formData.get("wheelId") ?? "").trim();
  const host = await requireHostMutation(
    request,
    "wheels:operate",
    formData,
    {
      intent,
      routeFamily: "HOST_PORTAL",
      targetType: wheelId ? "GameWheel" : "Game",
      targetId: wheelId || params.id,
    },
  );
  const admin =
    intent === "create-prize-claim"
      ? await getHostAdminContext(host.shop)
      : null;
  const result = await handleGameModeAction({
    request,
    gameId: params.id,
    shop: host.shop,
    admin,
  });
  if (
    ["shuffle-wheel", "spin-wheel", "accept-result", "begin-game"].includes(
      intent,
    )
  )
    void recordHostAuditEvent({
      shop: host.shop,
      actorId: host.actorId,
      actorLabel: host.actorDisplayName,
      action: `wheel.${intent}`,
      targetType: "Game",
      targetId: params.id,
    });
  return result;
}
export default GameModePage;
export { ErrorBoundary };
