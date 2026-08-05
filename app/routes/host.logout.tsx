import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  requireHostMutation,
  revokeCurrentHostSession,
} from "../lib/host-auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await requireHostMutation(request, "dashboard:view", formData);
  const cookies = await revokeCurrentHostSession(request);
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return redirect("/host/login", { headers });
}
export async function loader() {
  throw new Response("Method not allowed", { status: 405 });
}
