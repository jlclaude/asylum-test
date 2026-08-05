import { createHash, randomBytes } from "node:crypto";
import { createCookie, redirect } from "react-router";
import type { HostRole } from "@prisma/client";
import db from "../db.server";
import {
  hostPermissions,
  hostRoleAllows,
  type HostPermission,
} from "./host-permissions";
import { recordHostAuditEvent } from "../models/host-audit.server";
import {
  hostCsrfTokensMatch,
  requireSameOrigin,
  verifyHostCsrfToken,
} from "./host-csrf.server";
import { HOST_CSRF_FIELD_NAME } from "./host-csrf";

const PRODUCTION = process.env.NODE_ENV === "production";
const COOKIE_NAME = PRODUCTION
  ? "__Host-asylum_host_session"
  : "asylum_host_session";
const hostCookie = createCookie(COOKIE_NAME, {
  httpOnly: true,
  secure: PRODUCTION,
  sameSite: "lax",
  path: "/",
});
const csrfCookie = createCookie(
  PRODUCTION ? "__Host-asylum_host_csrf" : "asylum_host_csrf",
  { httpOnly: false, secure: PRODUCTION, sameSite: "strict", path: "/" },
);
const loginCsrfCookie = createCookie(
  PRODUCTION ? "__Host-asylum_host_login_csrf" : "asylum_host_login_csrf",
  {
    httpOnly: true,
    secure: PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  },
);
const INACTIVITY_MS = 8 * 60 * 60 * 1000;
const NORMAL_MS = 12 * 60 * 60 * 1000;
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;

export type HostLoginConfigurationReason =
  | "HOST_PORTAL_SHOP_MISSING"
  | "HOST_PORTAL_SHOP_INVALID"
  | "HOST_SESSION_SECRET_MISSING"
  | "HOST_SESSION_SECRET_TOO_SHORT";

export type HostContext = {
  source: "HOST_PORTAL";
  shop: string;
  actorId: string;
  actorDisplayName: string;
  role: HostRole;
  sessionId: string;
  csrfToken: string;
  permissions: HostPermission[];
};

export function hashHostSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function randomHostToken() {
  return randomBytes(32).toString("base64url");
}
export async function createHostLoginCsrf() {
  const csrfToken = randomHostToken();
  return { csrfToken, cookie: await loginCsrfCookie.serialize(csrfToken) };
}

export async function checkHostLoginCsrf(request: Request, submitted: string) {
  const cookieToken =
    ((await loginCsrfCookie.parse(request.headers.get("Cookie"))) as
      string | null) ?? "";
  const matched = hostCsrfTokensMatch(submitted, cookieToken);
  return {
    formPresent: Boolean(submitted),
    cookiePresent: Boolean(cookieToken),
    matched,
  };
}

export function clearHostLoginCsrf() {
  return loginCsrfCookie.serialize("", { maxAge: 0 });
}
export function normalizeHostEmail(value: string) {
  return value.trim().toLowerCase();
}
export function requestIpHash(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const secret = process.env.HOST_SESSION_SECRET?.trim();
  if (PRODUCTION && (!secret || secret.length < 32)) {
    throw new Response("Host Portal session security is not configured.", {
      status: 503,
    });
  }
  return hashHostSecret(`${secret ?? "local-development-only"}:${ip}`);
}

export function hostLoginConfigurationIssue(
  production = process.env.NODE_ENV === "production",
): HostLoginConfigurationReason | null {
  const shop = process.env.HOST_PORTAL_SHOP?.trim().toLowerCase();
  if (!shop) return "HOST_PORTAL_SHOP_MISSING";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
    return "HOST_PORTAL_SHOP_INVALID";
  if (!production) return null;
  const sessionSecret = process.env.HOST_SESSION_SECRET?.trim();
  if (!sessionSecret) return "HOST_SESSION_SECRET_MISSING";
  if (sessionSecret.length < 32) return "HOST_SESSION_SECRET_TOO_SHORT";
  return null;
}

export function configuredHostShop() {
  const value = process.env.HOST_PORTAL_SHOP?.trim().toLowerCase();
  if (!value || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Response("Host Portal is not configured. Set HOST_PORTAL_SHOP.", {
      status: 503,
    });
  }
  return value;
}

export async function createHostSession(input: {
  hostUserId: string;
  request: Request;
  remember: boolean;
}) {
  const token = randomHostToken();
  const csrfToken = randomHostToken();
  const maxAgeMs = input.remember ? REMEMBER_MS : NORMAL_MS;
  const session = await db.hostSession.create({
    data: {
      hostUserId: input.hostUserId,
      tokenHash: hashHostSecret(token),
      csrfTokenHash: hashHostSecret(csrfToken),
      expiresAt: new Date(Date.now() + maxAgeMs),
      ipHash: requestIpHash(input.request),
      userAgent: input.request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
  return {
    session,
    csrfToken,
    cookies: [
      await hostCookie.serialize(token, {
        maxAge: Math.floor(maxAgeMs / 1000),
      }),
      await csrfCookie.serialize(csrfToken, {
        maxAge: Math.floor(maxAgeMs / 1000),
      }),
    ],
  };
}

async function sessionToken(request: Request) {
  return (await hostCookie.parse(request.headers.get("Cookie"))) as
    string | null;
}

export async function optionalHostContext(
  request: Request,
): Promise<HostContext | null> {
  const token = await sessionToken(request);
  if (!token) return null;
  const now = new Date();
  const session = await db.hostSession.findUnique({
    where: { tokenHash: hashHostSecret(token) },
    include: { hostUser: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.hostUser.isActive ||
    now.getTime() - session.lastSeenAt.getTime() > INACTIVITY_MS
  )
    return null;
  if (now.getTime() - session.lastSeenAt.getTime() > 15 * 60 * 1000)
    await db.hostSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  const csrfToken =
    ((await csrfCookie.parse(request.headers.get("Cookie"))) as
      string | null) ?? "";
  return {
    source: "HOST_PORTAL",
    shop: session.hostUser.shop,
    actorId: session.hostUser.id,
    actorDisplayName: session.hostUser.displayName,
    role: session.hostUser.role,
    sessionId: session.id,
    csrfToken,
    permissions: hostPermissions(session.hostUser.role),
  };
}

export async function requireHostUser(request: Request) {
  const context = await optionalHostContext(request);
  if (!context)
    throw redirect("/host/login?expired=1", {
      headers: { "Set-Cookie": await hostCookie.serialize("", { maxAge: 0 }) },
    });
  return context;
}

export async function requireHostPermission(
  request: Request,
  permission: HostPermission,
) {
  const context = await requireHostUser(request);
  if (!hostRoleAllows(context.role, permission)) {
    void recordHostAuditEvent({
      shop: context.shop,
      actorId: context.actorId,
      actorLabel: context.actorDisplayName,
      action: "authorization.denied",
      metadata: { permission },
    });
    throw new Response("You do not have permission to perform this action.", {
      status: 403,
    });
  }
  return context;
}

export async function requireHostMutation(
  request: Request,
  permission: HostPermission,
  formData: FormData,
  diagnostic?: {
    intent?: string;
    routeFamily?: "HOST_PORTAL";
    targetType?: string;
    targetId?: string;
  },
) {
  requireSameOrigin(request);
  const context = await requireHostPermission(request, permission);
  const session = await hostSessionSecurity(request);
  const csrfToken = String(
    formData.get(HOST_CSRF_FIELD_NAME) ??
      request.headers.get("X-Host-CSRF") ??
      "",
  );
  try {
    verifyHostCsrfToken(csrfToken, session.csrfTokenHash);
  } catch (error) {
    if (error instanceof Response && error.status === 403 && diagnostic) {
      console.warn("Host wheel action rejected", {
        reason: csrfToken ? "CSRF_INVALID" : "CSRF_FORM_MISSING",
        intent: diagnostic.intent ?? "unknown",
        routeFamily: diagnostic.routeFamily ?? "HOST_PORTAL",
        authenticated: true,
        role: context.role,
        shop: context.shop,
        targetType: diagnostic.targetType ?? null,
        targetId: diagnostic.targetId ?? null,
        csrfPresent: Boolean(csrfToken),
      });
    }
    throw error;
  }
  return context;
}

export async function hostSessionSecurity(request: Request) {
  const token = await sessionToken(request);
  if (!token) throw new Response("Host session is missing.", { status: 401 });
  const session = await db.hostSession.findUnique({
    where: { tokenHash: hashHostSecret(token) },
  });
  if (!session || session.revokedAt)
    throw new Response("Host session is invalid.", { status: 401 });
  return session;
}

export async function revokeCurrentHostSession(request: Request) {
  const token = await sessionToken(request);
  if (token)
    await db.hostSession.updateMany({
      where: { tokenHash: hashHostSecret(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  return [
    await hostCookie.serialize("", { maxAge: 0 }),
    await csrfCookie.serialize("", { maxAge: 0 }),
  ];
}
