import type { LoaderFunctionArgs } from "react-router";
import { loadReadOnlyBroadcast } from "../lib/broadcast-loader.server";
import BroadcastReadOnlyPage from "./broadcast";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return loadReadOnlyBroadcast(params.gameId ?? "", new URL(request.url).searchParams.get("token") ?? "");
}

export async function action() { throw new Response("Method not allowed.", { status: 405 }); }
export default BroadcastReadOnlyPage;
