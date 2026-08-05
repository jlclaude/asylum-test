import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useRouteError,
} from "react-router";
import { HostErrorPage } from "../components/host/HostErrorPage";
import {
  configuredHostShop,
  createHostSession,
  hashHostSecret,
  optionalHostContext,
  requestIpHash,
} from "../lib/host-auth.server";
import { requireSameOrigin } from "../lib/host-csrf.server";
import {
  authenticateHostPassword,
  loginAttemptBlocked,
  recordFailedHostLogin,
  recordLoginAttemptFailure,
} from "../models/host-user.server";
import { recordHostAuditEvent } from "../models/host-audit.server";
import "../styles/host-portal.css";

export async function loader({ request }: LoaderFunctionArgs) {
  if (await optionalHostContext(request)) throw redirect("/host");
  return { expired: new URL(request.url).searchParams.has("expired") };
}
export async function action({ request }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const shop = configuredHostShop();
  const identifierHash = hashHostSecret(
    `${shop}:${email.trim().toLowerCase()}`,
  );
  const ipHash = requestIpHash(request);
  if (await loginAttemptBlocked(identifierHash, ipHash))
    return { error: "The email or password is incorrect." };
  const user = await authenticateHostPassword(shop, email, password);
  if (!user) {
    await Promise.all([
      recordLoginAttemptFailure(identifierHash, ipHash),
      recordFailedHostLogin(shop, email),
      recordHostAuditEvent({
        shop,
        action: "login.failure",
        metadata: { ipHash: ipHash.slice(0, 12) },
      }),
    ]);
    return { error: "The email or password is incorrect." };
  }
  const created = await createHostSession({
    hostUserId: user.id,
    request,
    remember: formData.get("remember") === "yes",
  });
  await recordHostAuditEvent({
    shop,
    actorId: user.id,
    actorLabel: user.displayName,
    action: "login.success",
  });
  const headers = new Headers();
  for (const cookie of created.cookies) headers.append("Set-Cookie", cookie);
  return redirect("/host", { headers });
}
export default function HostLogin() {
  const { expired } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <main className="host-page host-login">
      <section className="host-card">
        <p className="host-kicker">Asylum Games</p>
        <h1>Host Portal</h1>
        <p>Authorized operators only.</p>
        {expired ? (
          <p className="host-message host-error">
            Your session expired. Sign in again.
          </p>
        ) : null}
        {data?.error ? (
          <p className="host-message host-error" role="alert">
            {data.error}
          </p>
        ) : null}
        <Form className="host-form" method="post">
          <label>
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            <span>
              <input type="checkbox" name="remember" value="yes" /> Remember
              this device
            </span>
          </label>
          <button className="host-button">Sign in</button>
        </Form>
      </section>
    </main>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <HostErrorPage
      title="Host Login Error"
      message={
        error instanceof Error ? error.message : "Host login is unavailable."
      }
    />
  );
}
