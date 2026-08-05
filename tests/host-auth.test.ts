import assert from "node:assert/strict";
import test from "node:test";
import {
  checkHostLoginCsrf,
  createHostLoginCsrf,
  hashHostSecret,
  hostLoginConfigurationIssue,
  normalizeHostEmail,
  randomHostToken,
} from "../app/lib/host-auth.server.ts";
import {
  hashHostPassword,
  validateHostPassword,
  verifyHostPassword,
} from "../app/lib/host-password.server.ts";
import { hostRoleAllows } from "../app/lib/host-permissions.ts";
import {
  checkHostRequestOrigin,
  configuredHostOrigin,
  securityDiagnostic,
  verifyHostCsrfToken,
} from "../app/lib/host-csrf.server.ts";

test("Host tokens contain 256 bits and only their stable hash is persisted", () => {
  const token = randomHostToken();
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.match(hashHostSecret(token), /^[a-f0-9]{64}$/);
  assert.ok(!hashHostSecret(token).includes(token));
});
test("Host emails are normalized", () =>
  assert.equal(
    normalizeHostEmail("  OWNER@Example.COM "),
    "owner@example.com",
  ));
test("Host login configuration identifies missing production variables without values", () => {
  const previousShop = process.env.HOST_PORTAL_SHOP;
  const previousSecret = process.env.HOST_SESSION_SECRET;
  try {
    delete process.env.HOST_PORTAL_SHOP;
    delete process.env.HOST_SESSION_SECRET;
    assert.equal(hostLoginConfigurationIssue(true), "HOST_PORTAL_SHOP_MISSING");
    process.env.HOST_PORTAL_SHOP = "invalid-shop";
    assert.equal(hostLoginConfigurationIssue(true), "HOST_PORTAL_SHOP_INVALID");
    process.env.HOST_PORTAL_SHOP = "asylum.myshopify.com";
    assert.equal(
      hostLoginConfigurationIssue(true),
      "HOST_SESSION_SECRET_MISSING",
    );
    process.env.HOST_SESSION_SECRET = "too-short";
    assert.equal(
      hostLoginConfigurationIssue(true),
      "HOST_SESSION_SECRET_TOO_SHORT",
    );
    process.env.HOST_SESSION_SECRET = "x".repeat(32);
    assert.equal(hostLoginConfigurationIssue(true), null);
  } finally {
    if (previousShop === undefined) delete process.env.HOST_PORTAL_SHOP;
    else process.env.HOST_PORTAL_SHOP = previousShop;
    if (previousSecret === undefined) delete process.env.HOST_SESSION_SECRET;
    else process.env.HOST_SESSION_SECRET = previousSecret;
  }
});
test("Host passwords use Argon2id", async () => {
  const password = "a long host passphrase";
  const hash = await hashHostPassword(password);
  assert.match(hash, /^\$argon2id\$/);
  assert.ok(!hash.includes(password));
  assert.equal(await verifyHostPassword(hash, password), true);
  assert.equal(await verifyHostPassword(hash, "incorrect"), false);
});
test("Host password policy rejects unsafe lengths", () => {
  assert.match(validateHostPassword("short") ?? "", /at least 12/);
  assert.match(validateHostPassword("x".repeat(129)) ?? "", /no more than 128/);
  assert.equal(validateHostPassword("a safe long passphrase"), null);
});
test("Host CSRF values are checked against stored hashes", () => {
  const token = randomHostToken();
  assert.doesNotThrow(() => verifyHostCsrfToken(token, hashHostSecret(token)));
  assert.throws(() => verifyHostCsrfToken("wrong", hashHostSecret(token)));
});
test("Host role matrix enforces owner-only and wheel permissions", () => {
  for (const permission of [
    "hosts:manage",
    "backups:manage",
    "settings:manage",
    "games:delete",
  ] as const) {
    assert.equal(hostRoleAllows("OWNER", permission), true);
    assert.equal(hostRoleAllows("HOST", permission), false);
    assert.equal(hostRoleAllows("MODERATOR", permission), false);
    assert.equal(hostRoleAllows("VIEWER", permission), false);
  }
  assert.equal(hostRoleAllows("HOST", "wheels:operate"), true);
  assert.equal(hostRoleAllows("MODERATOR", "wheels:operate"), false);
  assert.equal(hostRoleAllows("VIEWER", "claims:manage"), false);
});

test("configured public origin accepts Render HTTPS regardless of internal request URL", () => {
  const previous = process.env.HOST_PORTAL_URL;
  process.env.HOST_PORTAL_URL = "https://asylum-test.onrender.com/";
  try {
    assert.equal(configuredHostOrigin(), "https://asylum-test.onrender.com");
    const request = new Request(
      "http://localhost:3000/host/login.data?expired=1",
      {
        method: "POST",
        headers: {
          origin: "https://asylum-test.onrender.com",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "asylum-test.onrender.com",
        },
      },
    );
    assert.equal(checkHostRequestOrigin(request).ok, true);
    assert.equal(
      securityDiagnostic(request, "TEST").pathname,
      "/host/login.data",
    );
  } finally {
    if (previous === undefined) delete process.env.HOST_PORTAL_URL;
    else process.env.HOST_PORTAL_URL = previous;
  }
});

test("missing and unapproved origins remain rejected", () => {
  const previous = process.env.HOST_PORTAL_URL;
  process.env.HOST_PORTAL_URL = "https://asylum-test.onrender.com";
  try {
    assert.equal(
      checkHostRequestOrigin(
        new Request("http://localhost:3000/host/login", { method: "POST" }),
      ).ok,
      false,
    );
    assert.equal(
      checkHostRequestOrigin(
        new Request("http://localhost:3000/host/login", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ).ok,
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.HOST_PORTAL_URL;
    else process.env.HOST_PORTAL_URL = previous;
  }
});

test("login CSRF cookie is host-wide and must match the hidden form value", async () => {
  const csrf = await createHostLoginCsrf();
  assert.match(csrf.cookie, /Path=\//);
  assert.match(csrf.cookie, /HttpOnly/);
  assert.match(csrf.cookie, /SameSite=Lax/);
  const cookie = csrf.cookie.split(";")[0];
  assert.deepEqual(
    await checkHostLoginCsrf(
      new Request("http://localhost/host/login.data?expired=1", {
        headers: { cookie },
      }),
      csrf.csrfToken,
    ),
    { formPresent: true, cookiePresent: true, matched: true },
  );
  assert.equal(
    (
      await checkHostLoginCsrf(
        new Request("http://localhost/host/login.data", {
          headers: { cookie },
        }),
        "wrong",
      )
    ).matched,
    false,
  );
  assert.deepEqual(
    await checkHostLoginCsrf(
      new Request("http://localhost/host/login.data"),
      csrf.csrfToken,
    ),
    { formPresent: true, cookiePresent: false, matched: false },
  );
});
