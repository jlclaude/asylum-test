import assert from "node:assert/strict";
import test from "node:test";
import {
  hashHostSecret,
  normalizeHostEmail,
  randomHostToken,
} from "../app/lib/host-auth.server.ts";
import {
  hashHostPassword,
  validateHostPassword,
  verifyHostPassword,
} from "../app/lib/host-password.server.ts";
import { hostRoleAllows } from "../app/lib/host-permissions.ts";
import { verifyHostCsrfToken } from "../app/lib/host-csrf.server.ts";

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
