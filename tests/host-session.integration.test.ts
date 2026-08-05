import assert from "node:assert/strict";
import test, { after } from "node:test";
import db from "../app/db.server.ts";
import {
  createHostSession,
  optionalHostContext,
  revokeCurrentHostSession,
} from "../app/lib/host-auth.server.ts";
import { hashHostPassword } from "../app/lib/host-password.server.ts";
import { getGameForShop } from "../app/models/game.server.ts";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shopA = `host-a-${suffix}.myshopify.com`;
const shopB = `host-b-${suffix}.myshopify.com`;
const userIds: string[] = [];
const gameIds: string[] = [];
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
