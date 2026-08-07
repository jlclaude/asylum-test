import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { recordHostAuditEvent } from "../models/host-audit.server";
import { loadGameControlCenter } from "../services/game-control-center.server";
import { GameControlCenter } from "../components/game-control/GameControlCenter";
import {
  gameControlRoutes,
  hostGameControlPermissions,
} from "../lib/game-control-routes";
import { handleGameControlAction } from "../services/game-control-actions.server";
import { getHostAdminContext } from "../lib/host-shopify.server";
import { hostOperator } from "../lib/operator-context.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "games:view");
  const controlCenter = await loadGameControlCenter({
    gameId: params.id,
    shop: host.shop,
    requestUrl: request.url,
    csrfToken: host.csrfToken,
    includeReadiness: true,
  });
  return {
    ...controlCenter,
    permissions: hostGameControlPermissions(host.permissions),
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const permission =
    intent === "delete-game"
      ? ("games:delete" as const)
      : intent === "archive-game" || intent === "restore-game"
        ? ("games:archive" as const)
        : intent === "open-wheels" || intent === "open-broadcast"
          ? ("wheels:operate" as const)
          : [
                "create-prize-claim",
                "revoke-prize-claim",
                "fulfill-prize-claim",
              ].includes(intent)
            ? ("prizeClaims:manage" as const)
            : [
                  "create-claim",
                  "confirm-claim",
                  "cancel-claim",
                  "edit-claim-name",
                ].includes(intent)
              ? ("claims:manage" as const)
              : ("games:manage" as const);
  const host = await requireHostMutation(request, permission, formData);
  const admin =
    intent === "create-prize-claim"
      ? await getHostAdminContext(host.shop)
      : undefined;
  const result = await handleGameControlAction({
    request,
    formData,
    gameId: params.id,
    operator: hostOperator(host),
    admin,
    routes: gameControlRoutes("HOST_PORTAL", params.id ?? "", host.csrfToken),
    redirect,
  });
  if (!(result instanceof Response))
    await recordHostAuditEvent({
      shop: host.shop,
      actorId: host.actorId,
      actorLabel: host.actorDisplayName,
      action: `game.${intent}`,
      targetType: "Game",
      targetId: params.id,
    });
  return result;
}
export default function HostGame() {
  const data = useLoaderData<typeof loader>();
  return (
    <GameControlCenter
      data={data}
      routeMode="HOST_PORTAL"
      permissions={data.permissions}
    />
  );
}

export function ErrorBoundary() {
  return (
    <section className="host-card">
      <h1>Game Control Center Error</h1>
      <p>
        The game could not be loaded. Return to the Host dashboard and try
        again.
      </p>
      <a className="host-link" href="/host">
        Return to Dashboard
      </a>
    </section>
  );
}
