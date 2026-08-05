import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { randomUUID } from "node:crypto";
import {
  data,
  isRouteErrorResponse,
  redirect,
  useActionData,
  useLoaderData,
  useRouteError,
} from "react-router";
import { HostErrorPage } from "../components/host/HostErrorPage";
import {
  configuredHostShop,
  checkHostLoginCsrf,
  clearHostLoginCsrf,
  createHostLoginCsrf,
  createHostSession,
  hashHostSecret,
  hostLoginConfigurationIssue,
  optionalHostContext,
  requestIpHash,
} from "../lib/host-auth.server";
import {
  checkHostRequestOrigin,
  securityDiagnostic,
} from "../lib/host-csrf.server";
import { HOST_CSRF_FIELD_NAME } from "../lib/host-csrf";
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
  const csrf = await createHostLoginCsrf();
  return data(
    {
      expired: new URL(request.url).searchParams.has("expired"),
      csrfToken: csrf.csrfToken,
    },
    { headers: { "Set-Cookie": csrf.cookie } },
  );
}
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  if (process.env.HOST_LOGIN_DEBUG === "1") {
    console.info("Host login form fields", {
      fields: Array.from(new Set(formData.keys())),
    });
  }
  const origin = checkHostRequestOrigin(request);
  const csrf = await checkHostLoginCsrf(
    request,
    String(formData.get(HOST_CSRF_FIELD_NAME) ?? ""),
  );
  if (!origin.ok || !csrf.matched) {
    const reason = !origin.ok
      ? origin.reason
      : !csrf.formPresent
        ? "CSRF_FORM_MISSING"
        : !csrf.cookiePresent
          ? "CSRF_COOKIE_MISSING"
          : "CSRF_MISMATCH";
    console.warn(
      "Host login rejected",
      securityDiagnostic(request, reason, {
        csrfFormPresent: csrf.formPresent,
        csrfCookiePresent: csrf.cookiePresent,
        csrfMatched: csrf.matched,
        originMatched: origin.ok,
      }),
    );
    throw new Response("Host login is temporarily unavailable.", {
      status: 403,
    });
  }
  const state = {
    accountFound: false,
    passwordVerificationStarted: false,
    sessionCreationStarted: false,
    sessionCreated: false,
  };
  let failureReason: string | null = hostLoginConfigurationIssue();
  try {
    if (failureReason) throw new Error(failureReason);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const shop = configuredHostShop();
    const identifierHash = hashHostSecret(
      `${shop}:${email.trim().toLowerCase()}`,
    );
    const ipHash = requestIpHash(request);
    if (await loginAttemptBlocked(identifierHash, ipHash))
      return { error: "The email or password is incorrect." };
    const user = await authenticateHostPassword(
      shop,
      email,
      password,
      (accountFound) => {
        state.accountFound = accountFound;
        state.passwordVerificationStarted = true;
      },
    );
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
    state.sessionCreationStarted = true;
    const created = await createHostSession({
      hostUserId: user.id,
      request,
      remember: formData.get("remember") === "yes",
    });
    state.sessionCreated = true;
    await recordHostAuditEvent({
      shop,
      actorId: user.id,
      actorLabel: user.displayName,
      action: "login.success",
    });
    const headers = new Headers();
    for (const cookie of created.cookies) headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", await clearHostLoginCsrf());
    return redirect("/host", { headers });
  } catch (error) {
    failureReason ??= state.sessionCreated
      ? "LOGIN_FINALIZATION_FAILED"
      : state.sessionCreationStarted
        ? "SESSION_CREATION_FAILED"
        : state.passwordVerificationStarted
          ? "PASSWORD_VERIFICATION_FAILED"
          : "ACCOUNT_LOOKUP_FAILED";
    const referenceId = randomUUID().slice(0, 8).toUpperCase();
    console.error("Host login unavailable", {
      reason: failureReason,
      referenceId,
      ...state,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    throw new Response(
      `Host login is temporarily unavailable. Reference: ${referenceId}`,
      { status: 503 },
    );
  }
}
export default function HostLogin() {
  const { expired, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <HostLoginForm
      expired={expired}
      csrfToken={csrfToken}
      error={actionData?.error}
    />
  );
}

export function HostLoginForm({
  expired,
  csrfToken,
  error,
}: {
  expired: boolean;
  csrfToken: string | null | undefined;
  error?: string;
}) {
  if (!csrfToken) {
    console.error("Host login unavailable", {
      reason: "CSRF_TOKEN_NOT_CREATED",
    });
    return (
      <main className="host-page host-login">
        <section className="host-card">
          <p className="host-kicker">Asylum Games</p>
          <h1>Host Portal</h1>
          <p className="host-message host-error" role="alert">
            Host login is temporarily unavailable.
          </p>
        </section>
      </main>
    );
  }
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
        {error ? (
          <p className="host-message host-error" role="alert">
            {error}
          </p>
        ) : null}
        <form className="host-form" method="post" action="/host/login">
          <input type="hidden" name={HOST_CSRF_FIELD_NAME} value={csrfToken} />
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
        </form>
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
        isRouteErrorResponse(error) && error.status === 503
          ? String(error.data)
          : error instanceof Error
            ? error.message
            : "Host login is unavailable."
      }
    />
  );
}
