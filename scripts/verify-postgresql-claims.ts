import db from "../app/db.server";
import { createGame } from "../app/models/game.server";
import { createPublicClaim } from "../app/models/claim.server";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing required environment variable: DATABASE_URL");
const parsed = new URL(databaseUrl);
if (!/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || !parsed.pathname.includes("asylum_")) {
  throw new Error("This diagnostic requires a local disposable asylum_* PostgreSQL database.");
}

const shop = `postgres-claim-test-${Date.now()}.myshopify.com`;
try {
  const game = await createGame({
    shop, title: "PostgreSQL Claim Capacity Test", totalSpots: 1,
    pricePerSpot: "12.50", wheelCount: 1, status: "OPEN",
  });
  const results = await Promise.all([
    createPublicClaim({ gameId: game.id, displayName: "Concurrent One", quantity: 1 }),
    createPublicClaim({ gameId: game.id, displayName: "Concurrent Two", quantity: 1 }),
  ]);
  const successes = results.filter((result) => result.success).length;
  const reserved = await db.claim.aggregate({
    where: { gameId: game.id, status: { in: ["PENDING", "CONFIRMED"] } },
    _sum: { quantity: true },
  });
  if (successes !== 1 || reserved._sum.quantity !== 1) {
    throw new Error("Serializable public-claim capacity protection failed.");
  }
  console.info("Concurrent PostgreSQL claims preserved the one-spot capacity exactly.");
} finally {
  await db.game.deleteMany({ where: { shop } });
  await db.shopRaffleSequence.deleteMany({ where: { shop } });
  await db.$disconnect();
}
