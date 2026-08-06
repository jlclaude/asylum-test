import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeDisplayNameForUniqueness } from "../app/lib/claim-display-name.ts";

const db = new PrismaClient();

try {
  const games = await db.game.findMany({
    select: {
      id: true,
      claims: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  const conflicts = [];

  for (const game of games) {
    await db.$transaction(
      async (transaction) => {
        const groups = new Map();
        for (const [index, claim] of game.claims.entries()) {
          const normalizedDisplayName = normalizeDisplayNameForUniqueness(
            claim.displayName,
          );
          await transaction.claim.update({
            where: { id: claim.id },
            data: { normalizedDisplayName: normalizedDisplayName || null },
          });
          if (!["PENDING", "CONFIRMED"].includes(claim.status)) {
            await transaction.claimNameReservation.deleteMany({
              where: { claimId: claim.id },
            });
            continue;
          }
          const group = groups.get(normalizedDisplayName) ?? [];
          group.push({ ...claim, sequence: index + 1 });
          groups.set(normalizedDisplayName, group);
        }

        for (const [normalizedDisplayName, claims] of groups) {
          if (!normalizedDisplayName || claims.length > 1) {
            await transaction.claimNameReservation.deleteMany({
              where: { claimId: { in: claims.map((claim) => claim.id) } },
            });
            conflicts.push({
              gameId: game.id,
              displayName: claims[0]?.displayName ?? "",
              claimSequences: claims.map((claim) => claim.sequence),
            });
            continue;
          }
          const claim = claims[0];
          await transaction.claimNameReservation.upsert({
            where: { claimId: claim.id },
            create: {
              gameId: game.id,
              claimId: claim.id,
              normalizedDisplayName,
            },
            update: { normalizedDisplayName },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  console.info(
    JSON.stringify(
      {
        gamesScanned: games.length,
        conflicts,
        message: conflicts.length
          ? "Duplicate active names were left unchanged and must be repaired before wheel initialization."
          : "All active claim-name reservations were backfilled.",
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
