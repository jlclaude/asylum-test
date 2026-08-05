import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "react-router";
import { authenticate } from "../shopify.server";
import { loadGameControlCenter } from "../services/game-control-center.server";
import { GameControlCenter as SharedGameControlCenter } from "../components/game-control/GameControlCenter";
import {
  gameControlRoutes,
  shopifyGameControlPermissions,
} from "../lib/game-control-routes";
import { handleGameControlAction } from "../services/game-control-actions.server";

import "../styles/game-results.css";
import "../styles/prize-claims.css";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  return loadGameControlCenter({
    gameId: params.id,
    shop: session.shop,
    requestUrl: request.url,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session, redirect, admin } = await authenticate.admin(request);
  return handleGameControlAction({
    request,
    gameId: params.id,
    shop: session.shop,
    admin,
    routes: gameControlRoutes("SHOPIFY_ADMIN", params.id ?? ""),
    redirect,
  });
}

export default function GameControlCenterRoute() {
  const controlData = useLoaderData<typeof loader>();
  return (
    <SharedGameControlCenter
      data={controlData}
      routeMode="SHOPIFY_ADMIN"
      permissions={shopifyGameControlPermissions}
    />
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  let message = "The game could not be loaded.";

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404
        ? "This game could not be found."
        : `${error.status}: ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 32,
        color: "#ffffff",
        background: "#101012",
      }}
    >
      <h1>Game error</h1>
      <p>{message}</p>
      <a href="/app">Return to dashboard</a>
    </main>
  );
}
