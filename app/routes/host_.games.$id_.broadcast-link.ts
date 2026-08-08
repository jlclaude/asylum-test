import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireHostMutation, requireHostPermission } from "../lib/host-auth.server";
import { broadcastSourceUrl, getOrCreateBroadcastToken, regenerateBroadcastToken } from "../lib/broadcast-token.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "wheels:operate");
  if (!params.id) throw new Response("Game ID is required.", { status: 400 });
  const token = await getOrCreateBroadcastToken(params.id, host.shop);
  if (!token) throw new Response("Game not found.", { status: 404 });
  return { url: broadcastSourceUrl(new URL(request.url).origin, params.id, token), csrfToken: host.csrfToken };
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!params.id) throw new Response("Game ID is required.", { status: 400 });
  const formData = await request.formData();
  const host = await requireHostMutation(request, "wheels:operate", formData, { intent: "regenerate-broadcast-link", routeFamily: "HOST_PORTAL", targetType: "Game", targetId: params.id });
  const token = await regenerateBroadcastToken(params.id, host.shop);
  if (!token) throw new Response("Game not found.", { status: 404 });
  return { url: broadcastSourceUrl(new URL(request.url).origin, params.id, token), csrfToken: host.csrfToken };
}
