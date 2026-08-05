import assert from "node:assert/strict";
import test, { after } from "node:test";
import db from "../app/db.server.ts";
import { createHostSession } from "../app/lib/host-auth.server.ts";
import { createGame } from "../app/models/game.server.ts";
import {
  action as hostAction,
  loader as hostLoader,
} from "../app/routes/host.games.$id.tsx";
import { loadGameControlCenter } from "../app/services/game-control-center.server.ts";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shop = `control-${suffix}.myshopify.com`;
const ids = { games: [] as string[], users: [] as string[] };

after(async () => {
  await db.game.deleteMany({ where: { id: { in: ids.games } } });
  await db.hostUser.deleteMany({ where: { id: { in: ids.users } } });
});

test("Host loader uses the complete shared control-center shape and VIEWER mutations are denied", async () => {
  const game = await createGame({
    shop,
    title: "Shared control test",
    description: "Line one\n\nLine three",
    totalSpots: 20,
    pricePerSpot: "5.00",
    wheelCount: 2,
    status: "OPEN",
  });
  ids.games.push(game.id);
  const viewer = await db.hostUser.create({
    data: {
      shop,
      email: `viewer-${suffix}@example.com`,
      displayName: "Viewer",
      role: "VIEWER",
      passwordHash: "unused",
    },
  });
  ids.users.push(viewer.id);
  const session = await createHostSession({
    hostUserId: viewer.id,
    request: new Request("http://localhost/host"),
    remember: false,
  });
  const cookie = session.cookies.map((value) => value.split(";")[0]).join("; ");
  const request = new Request(`http://localhost/host/games/${game.id}`, {
    headers: { cookie },
  });
  const hostData = await hostLoader({
    request,
    params: { id: game.id },
    context: undefined,
  } as never);
  const sharedData = await loadGameControlCenter({
    gameId: game.id,
    shop,
    requestUrl: request.url,
    includeReadiness: true,
  });
  assert.deepEqual(
    Object.keys(hostData)
      .filter((key) => key !== "permissions")
      .sort(),
    Object.keys(sharedData).sort(),
  );
  assert.equal(hostData.game.description, "Line one\n\nLine three");
  assert.equal(hostData.permissions.canManageGame, false);
  assert.ok(
    "totals" in hostData &&
      "readiness" in hostData &&
      "secondChance" in hostData &&
      "prizeClaims" in hostData,
  );

  const mutation = new Request(`http://localhost/host/games/${game.id}`, {
    method: "POST",
    headers: {
      cookie,
      origin: "http://localhost",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken: session.csrfToken,
      intent: "close-game",
    }),
  });
  await assert.rejects(
    hostAction({
      request: mutation,
      params: { id: game.id },
      context: undefined,
    } as never),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
});
