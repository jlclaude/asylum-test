import type { Prisma } from "@prisma/client";
import db from "../db.server";
import {
  selectSecondChanceEntries,
  type SecondChanceEntry,
} from "../lib/second-chance";
import { parseRaffleSearch } from "../lib/raffle-number";

export type SavedSecondChanceResult = {
  calculatedAt: string;
  sourceWheelId: string;
  sourceWheelLabel: string;
  mainWinner: string;
  offset: number;
  beforeDisplayName: string | null;
  afterDisplayName: string | null;
};

function parseNameEntries(value: string): SecondChanceEntry[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("The saved wheel entries are invalid.");
  const entries = parsed.filter((entry): entry is SecondChanceEntry => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    return typeof candidate.claimId === "string" && typeof candidate.displayName === "string";
  });
  if (entries.length !== parsed.length) throw new Error("The saved name-wheel entries are invalid.");
  return entries;
}

export async function ensureSecondChanceForCompletedWheel(
  transaction: Prisma.TransactionClient,
  gameRunId: string,
  completedWheelId: string,
) {
  const run = await transaction.gameRun.findUniqueOrThrow({
    where: { id: gameRunId },
    include: {
      game: { select: { secondChanceOffset: true } },
      rounds: {
        orderBy: { position: "asc" },
        take: 1,
        include: {
          wheels: {
            where: { type: "NAME" },
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (run.secondChanceCalculatedAt) return run;
  const sourceWheel = run.rounds[0]?.wheels[0];
  if (!sourceWheel || sourceWheel.id !== completedWheelId || sourceWheel.status !== "COMPLETED") {
    return run;
  }
  if (sourceWheel.winnerEntryIndex === null || !sourceWheel.winnerDisplayName) {
    throw new Error("Containment A has no persisted winner.");
  }

  const entries = parseNameEntries(sourceWheel.shuffledEntriesJson);
  const selection = selectSecondChanceEntries(
    entries,
    sourceWheel.winnerEntryIndex,
    run.game.secondChanceOffset,
  );
  const calculatedAt = new Date();

  await transaction.gameRun.updateMany({
    where: { id: run.id, secondChanceCalculatedAt: null },
    data: {
      secondChanceCalculatedAt: calculatedAt,
      secondChanceSourceWheelId: sourceWheel.id,
      secondChanceBeforeClaimId: selection.before?.claimId ?? null,
      secondChanceBeforeDisplayName: selection.before?.displayName ?? null,
      secondChanceBeforeEntryIndex: selection.before?.entryIndex ?? null,
      secondChanceAfterClaimId: selection.after?.claimId ?? null,
      secondChanceAfterDisplayName: selection.after?.displayName ?? null,
      secondChanceAfterEntryIndex: selection.after?.entryIndex ?? null,
    },
  });

  return transaction.gameRun.findUniqueOrThrow({ where: { id: run.id } });
}

export async function getSecondChanceResult(gameId: string): Promise<SavedSecondChanceResult | null> {
  const run = await db.gameRun.findUnique({
    where: { gameId },
    include: {
      game: { select: { secondChanceOffset: true } },
      rounds: {
        orderBy: { position: "asc" },
        take: 1,
        include: { wheels: { where: { type: "NAME" }, orderBy: { position: "asc" }, take: 1 } },
      },
    },
  });
  const source = run?.rounds[0]?.wheels[0];
  if (run && !run.secondChanceCalculatedAt && source?.status === "COMPLETED") {
    await db.$transaction((transaction) => ensureSecondChanceForCompletedWheel(
      transaction,
      run.id,
      source.id,
    ));
    return getSecondChanceResult(gameId);
  }
  if (!run?.secondChanceCalculatedAt || !run.secondChanceSourceWheelId) return null;
  if (!source?.winnerDisplayName) return null;
  return {
    calculatedAt: run.secondChanceCalculatedAt.toISOString(),
    sourceWheelId: run.secondChanceSourceWheelId,
    sourceWheelLabel: source.label,
    mainWinner: source.winnerDisplayName,
    offset: run.game.secondChanceOffset,
    beforeDisplayName: run.secondChanceBeforeDisplayName,
    afterDisplayName: run.secondChanceAfterDisplayName,
  };
}

export function getSecondChanceEntriesForShop(
  shop: string,
  options: { search?: string; archive?: "all" | "active" | "archived" } = {},
) {
  const search = options.search?.trim();
  const raffle = search ? parseRaffleSearch(search) : null;
  return db.gameRun.findMany({
    where: {
      secondChanceCalculatedAt: { not: null },
      game: {
        shop,
        ...(options.archive === "active" ? { archivedAt: null } : {}),
        ...(options.archive === "archived" ? { archivedAt: { not: null } } : {}),
      },
      ...(search ? {
        OR: [
          { game: { title: { contains: search } } },
          ...(raffle ? [{ game: { raffleNumber: raffle.number, ...(raffle.year ? { raffleYear: raffle.year } : {}) } }] : []),
          { secondChanceBeforeDisplayName: { contains: search } },
          { secondChanceAfterDisplayName: { contains: search } },
        ],
      } : {}),
    },
    include: {
      game: true,
      rounds: {
        orderBy: { position: "asc" },
        take: 1,
        include: { wheels: { where: { type: "NAME" }, orderBy: { position: "asc" }, take: 1 } },
      },
    },
    orderBy: { secondChanceCalculatedAt: "desc" },
  });
}
