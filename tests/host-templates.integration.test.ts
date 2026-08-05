import assert from "node:assert/strict";
import test, { after } from "node:test";
import db from "../app/db.server.ts";
import { createHostSession } from "../app/lib/host-auth.server.ts";
import { createGameTemplate } from "../app/models/game-template.server.ts";
import { action as createHostGame } from "../app/routes/host.games.new.tsx";
import { loader as loadHostTemplates } from "../app/routes/host.templates.tsx";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shop = `host-templates-${suffix}.myshopify.com`;
const createdIds = { users: [] as string[], games: [] as string[] };

after(async () => {
  await db.game.deleteMany({ where: { id: { in: createdIds.games } } });
  await db.gameTemplate.deleteMany({ where: { shop } });
  await db.hostUser.deleteMany({ where: { id: { in: createdIds.users } } });
});

test("Host views templates and creates a game through the shared game service", async () => {
  const hostUser = await db.hostUser.create({
    data: {
      shop,
      email: `host-${suffix}@example.com`,
      displayName: "Template Host",
      role: "HOST",
      passwordHash: "not-used-by-this-session-test",
    },
  });
  createdIds.users.push(hostUser.id);
  const template = await createGameTemplate(shop, {
    name: "Friday Template",
    defaultGameTitle: "Friday Containment",
    defaultGameDescription: "Line one\n\nLine three",
    totalSpots: 48,
    pricePerSpot: "12.50",
    wheelCount: 3,
    initialStatus: "CLOSED",
    isDefault: true,
  });
  const session = await createHostSession({
    hostUserId: hostUser.id,
    request: new Request("http://localhost/host"),
    remember: false,
  });
  const cookie = session.cookies.map((value) => value.split(";")[0]).join("; ");

  const loaded = await loadHostTemplates({
    request: new Request("http://localhost/host/templates", {
      headers: { cookie },
    }),
    params: {},
    context: undefined,
  } as never);
  assert.equal(loaded.canManage, true);
  assert.deepEqual(
    loaded.templates.map((value) => value.id),
    [template.id],
  );

  const request = new Request("http://localhost/host/games/new", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://localhost",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken: session.csrfToken,
      intent: "create-from-template",
      templateId: template.id,
    }),
  });
  let redirectResponse: Response | null = null;
  try {
    await createHostGame({
      request,
      params: {},
      context: undefined,
    } as never);
  } catch (error) {
    if (error instanceof Response) redirectResponse = error;
    else throw error;
  }
  assert.equal(redirectResponse?.status, 302);
  const game = await db.game.findFirstOrThrow({
    where: { shop, title: "Friday Containment" },
  });
  createdIds.games.push(game.id);
  assert.deepEqual(
    {
      description: game.description,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      wheelCount: game.wheelCount,
      status: game.status,
    },
    {
      description: "Line one\n\nLine three",
      totalSpots: 48,
      pricePerSpot: "12.5",
      wheelCount: 3,
      status: "CLOSED",
    },
  );
  assert.ok(game.secondChanceOffset >= 2 && game.secondChanceOffset <= 10);
  assert.ok(game.raffleNumber >= 1);
});
