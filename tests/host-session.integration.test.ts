import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import db from "../app/db.server.ts";
import {
  checkHostLoginCsrf,
  createHostLoginCsrf,
  createHostSession,
  optionalHostContext,
  revokeCurrentHostSession,
} from "../app/lib/host-auth.server.ts";
import { hashHostPassword } from "../app/lib/host-password.server.ts";
import { getGameForShop } from "../app/models/game.server.ts";
import { HOST_CSRF_FIELD_NAME } from "../app/lib/host-csrf.ts";
import {
  action as loginAction,
  HostLoginForm,
  loader as loginLoader,
} from "../app/routes/host_.login.tsx";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shopA = `host-a-${suffix}.myshopify.com`;
const shopB = `host-b-${suffix}.myshopify.com`;
const userIds: string[] = [];
const gameIds: string[] = [];

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function expectLoginCsrfRejection(
  csrfCookie: string,
  formValues: Record<string, string>,
) {
  const request = new Request("http://localhost:3000/host/login.data", {
    method: "POST",
    headers: {
      origin: "https://asylum-test.onrender.com",
      cookie: csrfCookie.split(";")[0],
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(formValues),
  });
  await assert.rejects(
    loginAction({ request, params: {}, context: undefined } as never),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
}
after(async () => {
  await db.hostUser.deleteMany({ where: { id: { in: userIds } } });
  await db.game.deleteMany({ where: { id: { in: gameIds } } });
});
test("Host sessions store no raw token and revoked sessions are rejected", async () => {
  const user = await db.hostUser.create({
    data: {
      shop: shopA,
      email: `owner-${suffix}@example.com`,
      displayName: "Owner",
      role: "OWNER",
      passwordHash: await hashHostPassword("a secure integration passphrase"),
    },
  });
  userIds.push(user.id);
  const request = new Request("http://localhost/host", {
    headers: { "user-agent": "node-test", "x-forwarded-for": "127.0.0.1" },
  });
  const created = await createHostSession({
    hostUserId: user.id,
    request,
    remember: false,
  });
  const cookieHeader = created.cookies
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const serializedSession = created.cookies[0].split(";")[0].split("=")[1];
  const saved = await db.hostSession.findUniqueOrThrow({
    where: { id: created.session.id },
  });
  assert.match(saved.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(saved.tokenHash, serializedSession);
  assert.ok(!saved.tokenHash.includes(serializedSession));
  const authenticatedRequest = new Request("http://localhost/host", {
    headers: { cookie: cookieHeader },
  });
  assert.deepEqual(
    { ...(await optionalHostContext(authenticatedRequest)), permissions: [] },
    {
      source: "HOST_PORTAL",
      shop: shopA,
      actorId: user.id,
      actorDisplayName: "Owner",
      role: "OWNER",
      sessionId: created.session.id,
      csrfToken: created.csrfToken,
      permissions: [],
    },
  );
  await revokeCurrentHostSession(authenticatedRequest);
  assert.equal(await optionalHostContext(authenticatedRequest), null);
});
test("Guessed cross-shop game IDs are rejected", async () => {
  const game = await db.game.create({
    data: {
      shop: shopB,
      title: "Other shop",
      totalSpots: 1,
      pricePerSpot: "1",
      wheelCount: 1,
      secondChanceOffset: 2,
      raffleYear: 2099,
      raffleNumber: Math.floor(Math.random() * 1_000_000) + 1,
      status: "OPEN",
    },
  });
  gameIds.push(game.id);
  assert.equal(await getGameForShop(game.id, shopA), null);
  assert.equal((await getGameForShop(game.id, shopB))?.id, game.id);
});

test("Render-origin login accepts matching CSRF on the React Router data path", async () => {
  const previousShop = process.env.HOST_PORTAL_SHOP;
  const previousOrigin = process.env.HOST_PORTAL_URL;
  process.env.HOST_PORTAL_SHOP = shopA;
  process.env.HOST_PORTAL_URL = "https://asylum-test.onrender.com";
  const password = "a production-safe host passphrase";
  const user = await db.hostUser.create({
    data: {
      shop: shopA,
      email: `login-${suffix}@example.com`,
      displayName: "Login Owner",
      role: "OWNER",
      passwordHash: await hashHostPassword(password),
    },
  });
  userIds.push(user.id);
  try {
    const csrf = await createHostLoginCsrf();
    const body = new URLSearchParams({
      [HOST_CSRF_FIELD_NAME]: csrf.csrfToken,
      email: user.email,
      password,
    });
    const request = new Request(
      "http://localhost:3000/host/login.data?expired=1",
      {
        method: "POST",
        headers: {
          origin: "https://asylum-test.onrender.com",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "asylum-test.onrender.com",
          cookie: csrf.cookie.split(";")[0],
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const response = await loginAction({
      request,
      params: {},
      context: undefined,
    } as never);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/host");
    assert.equal(
      await db.hostSession.count({
        where: { hostUserId: user.id, revokedAt: null },
      }),
      1,
    );
  } finally {
    restoreEnvironment("HOST_PORTAL_SHOP", previousShop);
    restoreEnvironment("HOST_PORTAL_URL", previousOrigin);
  }
});

test("Host login loader and rendered form share one matching CSRF field", async () => {
  const result = (await loginLoader({
    request: new Request("http://localhost/host/login?expired=1"),
    params: {},
    context: undefined,
  } as never)) as unknown as {
    data: { csrfToken: string; expired: boolean };
    init: { headers: HeadersInit };
  };
  assert.equal(result.data.expired, true);
  assert.ok(result.data.csrfToken.length > 0);
  const setCookie = new Headers(result.init.headers).get("Set-Cookie");
  assert.ok(setCookie);
  assert.equal(
    (
      await checkHostLoginCsrf(
        new Request("http://localhost/host/login", {
          headers: { cookie: setCookie.split(";")[0] },
        }),
        result.data.csrfToken,
      )
    ).matched,
    true,
  );

  const RoutesStub = createRoutesStub([
    {
      path: "/host/login",
      Component: () =>
        createElement(HostLoginForm, {
          expired: true,
          csrfToken: result.data.csrfToken,
        }),
    },
  ]);
  const markup = renderToStaticMarkup(
    createElement(RoutesStub, { initialEntries: ["/host/login?expired=1"] }),
  );
  const formMarkup = markup.match(/<form[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.match(formMarkup, /action="\/host\/login"/);
  assert.match(formMarkup, new RegExp(`name="${HOST_CSRF_FIELD_NAME}"`));
  assert.match(formMarkup, new RegExp(`value="${result.data.csrfToken}"`));
});

test("Host login rejects missing, misnamed, and incorrect CSRF form values without logging tokens", async () => {
  const previousOrigin = process.env.HOST_PORTAL_URL;
  process.env.HOST_PORTAL_URL = "https://asylum-test.onrender.com";
  const csrf = await createHostLoginCsrf();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => warnings.push(values);
  try {
    await expectLoginCsrfRejection(csrf.cookie, {
      email: "host@example.com",
      password: "not evaluated",
    });
    await expectLoginCsrfRejection(csrf.cookie, {
      _csrf: csrf.csrfToken,
      email: "host@example.com",
      password: "not evaluated",
    });
    await expectLoginCsrfRejection(csrf.cookie, {
      [HOST_CSRF_FIELD_NAME]: "incorrect-token",
      email: "host@example.com",
      password: "not evaluated",
    });
    assert.equal(warnings.length, 3);
    const logged = JSON.stringify(warnings);
    assert.equal(logged.includes(csrf.csrfToken), false);
    assert.equal(logged.includes("incorrect-token"), false);
  } finally {
    console.warn = originalWarn;
    restoreEnvironment("HOST_PORTAL_URL", previousOrigin);
  }
});
