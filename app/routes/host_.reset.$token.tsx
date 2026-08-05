import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useRouteError,
} from "react-router";
import { HostErrorPage } from "../components/host/HostErrorPage";
import { requireSameOrigin } from "../lib/host-csrf.server";
import { resetHostPassword } from "../models/host-user.server";
import "../styles/host-portal.css";
export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.token)
    throw new Response("Reset token is required.", { status: 400 });
  return { token: params.token };
}
export async function action({ request, params }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmation") ?? ""))
    return { error: "Passwords do not match." };
  try {
    await resetHostPassword(params.token ?? "", password);
    throw redirect("/host/login?reset=1");
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: error instanceof Error ? error.message : "Password reset failed.",
    };
  }
}
export default function HostReset() {
  const { token } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <main className="host-page host-login">
      <section className="host-card">
        <p className="host-kicker">One-time setup</p>
        <h1>Set Password</h1>
        {data?.error ? (
          <p className="host-message host-error">{data.error}</p>
        ) : null}
        <Form className="host-form" method="post">
          <input type="hidden" name="token" value={token} />
          <label>
            New password
            <input
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              name="confirmation"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <button className="host-button">Save Password</button>
        </Form>
      </section>
    </main>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <HostErrorPage
      title="Password Reset Error"
      message={
        error instanceof Error
          ? error.message
          : "This password reset cannot be completed."
      }
    />
  );
}
