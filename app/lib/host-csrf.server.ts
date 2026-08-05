import { createHash, timingSafeEqual } from "node:crypto";

function same(valueA: string, valueB: string) {
  const a = Buffer.from(valueA);
  const b = Buffer.from(valueB);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireSameOrigin(request: Request) {
  const check = checkHostRequestOrigin(request);
  if (!check.ok) {
    console.warn(
      "Host mutation rejected",
      securityDiagnostic(request, check.reason, { originMatched: false }),
    );
    throw new Response("Invalid request origin.", { status: 403 });
  }
}

type OriginFailure =
  | "ORIGIN_MISSING"
  | "ORIGIN_INVALID"
  | "ORIGIN_MISMATCH"
  | "ORIGIN_CONFIGURATION_INVALID";

export function configuredHostOrigin() {
  const configured =
    process.env.HOST_PORTAL_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.SHOPIFY_APP_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      process.env.NODE_ENV === "production" &&
      (url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function checkHostRequestOrigin(
  request: Request,
):
  | { ok: true; expectedOrigin: string; origin: string }
  | {
      ok: false;
      reason: OriginFailure;
      expectedOrigin: string | null;
      origin: string | null;
    } {
  const configured = configuredHostOrigin();
  const expectedOrigin =
    configured ??
    (process.env.NODE_ENV === "production"
      ? null
      : new URL(request.url).origin);
  if (!expectedOrigin)
    return {
      ok: false,
      reason: "ORIGIN_CONFIGURATION_INVALID",
      expectedOrigin: null,
      origin: null,
    };
  const supplied =
    request.headers.get("Origin") ?? request.headers.get("Referer");
  if (!supplied)
    return {
      ok: false,
      reason: "ORIGIN_MISSING",
      expectedOrigin,
      origin: null,
    };
  try {
    const origin = new URL(supplied).origin;
    if (origin !== expectedOrigin)
      return { ok: false, reason: "ORIGIN_MISMATCH", expectedOrigin, origin };
    return { ok: true, expectedOrigin, origin };
  } catch {
    return {
      ok: false,
      reason: "ORIGIN_INVALID",
      expectedOrigin,
      origin: null,
    };
  }
}

export function securityDiagnostic(
  request: Request,
  reason: string,
  input: {
    csrfFormPresent?: boolean;
    csrfCookiePresent?: boolean;
    csrfMatched?: boolean;
    originMatched?: boolean;
  } = {},
) {
  const supplied =
    request.headers.get("Origin") ?? request.headers.get("Referer");
  let origin: string | null = null;
  try {
    origin = supplied ? new URL(supplied).origin : null;
  } catch {
    origin = null;
  }
  return {
    reason,
    origin,
    expectedOrigin: configuredHostOrigin(),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    method: request.method,
    pathname: new URL(request.url).pathname,
    ...input,
  };
}

export function verifyHostCsrfToken(rawToken: string, storedHash: string) {
  const actual = createHash("sha256").update(rawToken).digest("hex");
  if (!rawToken || !same(actual, storedHash))
    throw new Response(
      "Invalid security token. Refresh the page and try again.",
      { status: 403 },
    );
}

export function hostCsrfTokensMatch(first: string, second: string) {
  if (!first || !second) return false;
  return same(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex"),
  );
}
