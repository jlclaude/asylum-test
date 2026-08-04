import { readFileSync, writeFileSync } from "node:fs";
import db from "../app/db.server";
import { RESTORE_CONFIRMATION } from "../app/lib/backup-constants";
import { createEmergencyBackup, restoreEmergencyBackup } from "../app/services/backup.server";
import { createGame } from "../app/models/game.server";
import { createClaim } from "../app/models/claim.server";
import { beginGameRun } from "../app/models/game-run.server";
import { runGameReadinessCheck } from "../app/services/game-readiness.server";

const [mode, path, shop = "postgres-backup-test.myshopify.com"] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing required environment variable: DATABASE_URL");
const parsed = new URL(databaseUrl);
if (!/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || !parsed.pathname.includes("asylum_")) {
  throw new Error("This diagnostic requires a local disposable asylum_* PostgreSQL database.");
}
if (!path) throw new Error("A temporary backup path is required.");

try {
  if (mode === "export") {
    const game = await createGame({
      shop, title: "PostgreSQL Backup Test", description: "Provider-neutral restore fixture",
      totalSpots: 20, pricePerSpot: "12.50", wheelCount: 1, status: "OPEN",
    });
    const claim = await createClaim({ gameId: game.id, displayName: "Backup Test", quantity: 2 });
    await db.claim.update({ where: { id: claim.id }, data: { status: "CONFIRMED", externalPayment: true } });
    await db.game.update({ where: { id: game.id }, data: { status: "CLOSED" } });
    await beginGameRun(game.id, shop);
    const readiness = await runGameReadinessCheck(game.id, shop);
    if (!readiness.isReady) throw new Error("Initialized PostgreSQL game failed readiness checks.");
    const document = await createEmergencyBackup(shop);
    writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
    console.info(`Created PostgreSQL backup fixture with ${document.data.games.length} game.`);
  } else if (mode === "restore") {
    const text = readFileSync(path, "utf8");
    const preview = await restoreEmergencyBackup({ text, shop, confirmation: RESTORE_CONFIRMATION });
    const [games, claims, sequences, runs, wheels] = await Promise.all([
      db.game.count({ where: { shop } }),
      db.claim.count({ where: { game: { shop } } }),
      db.shopRaffleSequence.count({ where: { shop } }),
      db.gameRun.count({ where: { game: { shop } } }),
      db.gameWheel.count({ where: { gameRound: { gameRun: { game: { shop } } } } }),
    ]);
    if (games !== 1 || claims !== 1 || sequences !== 1 || runs !== 1 || wheels !== 2 || preview.games !== 1) {
      throw new Error("PostgreSQL backup restore did not recreate the expected records.");
    }
    console.info("Restored PostgreSQL backup fixture with relations and yearly sequence intact.");
  } else {
    throw new Error("Mode must be export or restore.");
  }
} finally {
  await db.$disconnect();
}
