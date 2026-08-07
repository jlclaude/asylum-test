import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { MAX_SPIN_DURATION_SECONDS, MIN_SPIN_DURATION_SECONDS } from "../lib/spin-duration";
import { ensureSecondChanceForCompletedWheel } from "./second-chance.server";
import { getContainmentLabel, REWARD_CHAMBER_LABEL } from "../lib/wheel-labels";
import { rewardChamberEntries } from "../lib/reward-chamber";
import { retrySerializableTransaction } from "../lib/prisma-transaction.server";

export type NameWheelEntry = {
  claimId: string;
  displayName: string;
};

export type ValueWheelEntry = {
  value: string;
};

export type WheelEntry = NameWheelEntry | ValueWheelEntry;

export type AuthoritativeWheelState = {
  id: string;
  status: "READY" | "SPINNING" | "COMPLETED";
  entries: WheelEntry[];
  spinDurationSeconds: number | null;
  winnerEntryIndex: number | null;
  winnerDisplayName: string | null;
  winnerValue: string | null;
  spunAt: string | null;
  resultAcceptedAt: string | null;
};

export class StaleWheelStateError extends Error {
  constructor(
    message: string,
    readonly wheel: AuthoritativeWheelState,
  ) {
    super(message);
    this.name = "StaleWheelStateError";
  }
}

function authoritativeWheelState(wheel: {
  id: string;
  status: "READY" | "SPINNING" | "COMPLETED";
  shuffledEntriesJson: string;
  spinDurationSeconds: number | null;
  winnerEntryIndex: number | null;
  winnerDisplayName: string | null;
  winnerValue: string | null;
  spunAt: Date | null;
  resultAcceptedAt: Date | null;
}): AuthoritativeWheelState {
  return {
    id: wheel.id,
    status: wheel.status,
    entries: deserializeWheelEntries(wheel.shuffledEntriesJson),
    spinDurationSeconds: wheel.spinDurationSeconds,
    winnerEntryIndex: wheel.winnerEntryIndex,
    winnerDisplayName: wheel.winnerDisplayName,
    winnerValue: wheel.winnerValue,
    spunAt: wheel.spunAt?.toISOString() ?? null,
    resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null,
  };
}

async function staleWheel(
  transaction: Prisma.TransactionClient,
  wheelId: string,
  message = "This wheel changed in another session. The latest state has been loaded.",
): Promise<StaleWheelStateError> {
  const current = await transaction.gameWheel.findUniqueOrThrow({ where: { id: wheelId } });
  return new StaleWheelStateError(message, authoritativeWheelState(current));
}

export function serializeWheelEntries(entries: WheelEntry[]) {
  return JSON.stringify(entries);
}

export function deserializeWheelEntries(value: string): WheelEntry[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("The saved wheel entries are invalid.");
  }
  return parsed as WheelEntry[];
}

function secureShuffle<T>(entries: T[]) {
  const shuffled = [...entries];

  for (let current = shuffled.length - 1; current > 0; current -= 1) {
    const target = randomInt(current + 1);
    [shuffled[current], shuffled[target]] = [
      shuffled[target],
      shuffled[current],
    ];
  }

  return shuffled;
}

function isNameEntry(entry: WheelEntry): entry is NameWheelEntry {
  return "claimId" in entry && "displayName" in entry;
}

function isValueEntry(entry: WheelEntry): entry is ValueWheelEntry {
  return "value" in entry;
}

function secondChanceCompletionPayload(run: {
  secondChanceCalculatedAt: Date | null;
  secondChanceBeforeDisplayName: string | null;
  secondChanceAfterDisplayName: string | null;
}) {
  return run.secondChanceCalculatedAt ? {
    calculatedAt: run.secondChanceCalculatedAt.toISOString(),
    beforeDisplayName: run.secondChanceBeforeDisplayName,
    afterDisplayName: run.secondChanceAfterDisplayName,
  } : null;
}

export async function getGameRun(gameId: string) {
  return db.gameRun.findUnique({
    where: { gameId },
    include: {
      rounds: {
        orderBy: { position: "asc" },
        include: {
          wheels: {
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
}

export async function beginGameRun(gameId: string, shop: string) {
  try {
    return await retrySerializableTransaction(() => db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({
      where: { id: gameId, shop },
    });

    if (!game) throw new Error("Game not found.");
    if (game.archivedAt) throw new Error("This game is archived. Restore it before using Game Mode.");
    if (game.status !== "CLOSED") {
      throw new Error("Close the game before beginning Game Mode.");
    }

    const existing = await transaction.gameRun.findUnique({
      where: { gameId },
      include: {
        rounds: {
          orderBy: { position: "asc" },
          include: {
            wheels: { orderBy: { position: "asc" } },
          },
        },
      },
    });

    if (existing) return existing;

    const claims = await transaction.claim.findMany({
      where: {
        gameId,
        status: "CONFIRMED",
        externalPayment: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const nameEntries: NameWheelEntry[] = [];

    for (const claim of claims) {
      for (let index = 0; index < claim.quantity; index += 1) {
        nameEntries.push({
          claimId: claim.id,
          displayName: claim.displayName,
        });
      }
    }

    if (nameEntries.length === 0) {
      throw new Error("At least one confirmed paid claim is required.");
    }

    const run = await transaction.gameRun.create({
      data: { gameId },
    });

    const round = await transaction.gameRound.create({
      data: {
        gameRunId: run.id,
        position: 1,
        title: "Round 1",
        status: "READY",
      },
    });

    const namesJson = serializeWheelEntries(nameEntries);

    for (let index = 0; index < game.wheelCount; index += 1) {
      await transaction.gameWheel.create({
        data: {
          gameRoundId: round.id,
          position: index + 1,
          type: "NAME",
          label: getContainmentLabel(index + 1),
          originalEntriesJson: namesJson,
          shuffledEntriesJson: namesJson,
        },
      });
    }

    const valuesJson = serializeWheelEntries(rewardChamberEntries());

    await transaction.gameWheel.create({
      data: {
        gameRoundId: round.id,
        position: game.wheelCount + 1,
        type: "VALUE",
        label: REWARD_CHAMBER_LABEL,
        originalEntriesJson: valuesJson,
        shuffledEntriesJson: valuesJson,
      },
    });

    await transaction.game.update({
      where: { id: gameId },
      data: { status: "READY" },
    });

    return transaction.gameRun.findUniqueOrThrow({
      where: { id: run.id },
      include: {
        rounds: {
          orderBy: { position: "asc" },
          include: {
            wheels: { orderBy: { position: "asc" } },
          },
        },
      },
    });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await getGameRun(gameId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function shuffleGameWheel(
  wheelId: string,
  gameId: string,
  shop: string,
) {
  return db.$transaction(async (transaction) => {
    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: wheelId,
        gameRound: {
          gameRun: {
            gameId,
            game: { shop, archivedAt: null },
          },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "READY") {
      throw await staleWheel(transaction, wheel.id);
    }

    const shuffled = secureShuffle(
      deserializeWheelEntries(wheel.shuffledEntriesJson),
    );

    const update = await transaction.gameWheel.updateMany({
      where: {
        id: wheel.id,
        status: "READY",
        updatedAt: wheel.updatedAt,
      },
      data: {
        shuffledEntriesJson: serializeWheelEntries(shuffled),
        shuffledAt: new Date(),
      },
    });
    if (update.count === 0) {
      throw await staleWheel(transaction, wheel.id);
    }
    return transaction.gameWheel.findUniqueOrThrow({ where: { id: wheel.id } });
  });
}

export async function selectGameWheelDuration(
  wheelId: string,
  gameId: string,
  shop: string,
) {
  return db.$transaction(async (transaction) => {
    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: wheelId,
        gameRound: {
          gameRun: {
            gameId,
            game: { shop, archivedAt: null },
          },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "READY") {
      throw await staleWheel(transaction, wheel.id);
    }

    const spinDurationSeconds = randomInt(
      MIN_SPIN_DURATION_SECONDS,
      MAX_SPIN_DURATION_SECONDS + 1,
    );

    const update = await transaction.gameWheel.updateMany({
      where: {
        id: wheel.id,
        status: "READY",
        updatedAt: wheel.updatedAt,
      },
      data: { spinDurationSeconds },
    });
    if (update.count === 0) {
      throw await staleWheel(transaction, wheel.id);
    }

    return {
      wheelId: wheel.id,
      spinDurationSeconds,
    };
  });
}

export async function startGameWheelSpin(
  wheelId: string,
  gameId: string,
  shop: string,
) {
  return db.$transaction(async (transaction) => {
    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: wheelId,
        gameRound: {
          gameRun: {
            gameId,
            game: { shop, archivedAt: null },
          },
        },
      },
      include: {
        gameRound: {
          include: {
            gameRun: {
              include: { game: true },
            },
          },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "READY") {
      throw await staleWheel(transaction, wheel.id);
    }
    if (!wheel.spinDurationSeconds) {
      throw new Error("Select a random spin time before spinning.");
    }

    const entries = deserializeWheelEntries(wheel.shuffledEntriesJson);
    if (entries.length === 0) throw new Error("This wheel has no entries.");

    const winnerEntryIndex = randomInt(entries.length);
    const winningEntry = entries[winnerEntryIndex];
    const spunAt = new Date();

    let winnerClaimId: string | null = null;
    let winnerDisplayName: string | null = null;
    let winnerValue: string | null = null;

    if (wheel.type === "NAME" && isNameEntry(winningEntry)) {
      winnerClaimId = winningEntry.claimId;
      winnerDisplayName = winningEntry.displayName;
    }

    if (wheel.type === "VALUE" && isValueEntry(winningEntry)) {
      winnerValue = winningEntry.value;
    }

    const spin = await transaction.gameWheel.updateMany({
      where: {
        id: wheel.id,
        status: "READY",
        updatedAt: wheel.updatedAt,
      },
      data: {
        status: "SPINNING",
        winnerEntryIndex,
        winnerClaimId,
        winnerDisplayName,
        winnerValue,
        spunAt,
      },
    });
    if (spin.count === 0) {
      throw await staleWheel(transaction, wheel.id);
    }

    if (wheel.gameRound.status === "READY") {
      await transaction.gameRound.update({
        where: { id: wheel.gameRound.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    if (wheel.gameRound.gameRun.game.status === "READY") {
      await transaction.game.update({
        where: { id: gameId },
        data: { status: "IN_PROGRESS" },
      });
    }

    return {
      wheelId: wheel.id,
      wheelType: wheel.type,
      wheelLabel: wheel.label,
      winnerEntryIndex,
      winnerDisplayName,
      winnerValue,
      spinDurationSeconds: wheel.spinDurationSeconds,
      spinToken: spunAt.toISOString(),
    };
  });
}

export async function completeGameWheelSpin(
  wheelId: string,
  gameId: string,
  shop: string,
) {
  return db.$transaction(async (transaction) => {
    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: wheelId,
        gameRound: {
          gameRun: {
            gameId,
            game: { shop, archivedAt: null },
          },
        },
      },
      include: {
        gameRound: {
          include: { gameRun: true },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.winnerEntryIndex === null) {
      throw await staleWheel(transaction, wheel.id);
    }

    if (wheel.status === "COMPLETED") {
      const secondChanceRun = await ensureSecondChanceForCompletedWheel(
        transaction,
        wheel.gameRound.gameRunId,
        wheel.id,
      );
      return {
        wheelId: wheel.id,
        winnerDisplayName: wheel.winnerDisplayName,
        winnerValue: wheel.winnerValue,
        gameCompleted: wheel.gameRound.gameRun.completedAt !== null,
        secondChance: secondChanceCompletionPayload(secondChanceRun),
      };
    }
    if (wheel.status !== "SPINNING") {
      throw await staleWheel(transaction, wheel.id);
    }

    const completion = await transaction.gameWheel.updateMany({
      where: {
        id: wheel.id,
        status: "SPINNING",
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (completion.count === 0) {
      const completedWheel = await transaction.gameWheel.findUniqueOrThrow({
        where: { id: wheel.id },
        include: {
          gameRound: { include: { gameRun: true } },
        },
      });

      const secondChanceRun = await ensureSecondChanceForCompletedWheel(
        transaction,
        completedWheel.gameRound.gameRunId,
        completedWheel.id,
      );

      return {
        wheelId: completedWheel.id,
        winnerDisplayName: completedWheel.winnerDisplayName,
        winnerValue: completedWheel.winnerValue,
        gameCompleted: completedWheel.gameRound.gameRun.completedAt !== null,
        secondChance: secondChanceCompletionPayload(secondChanceRun),
      };
    }

    const secondChanceRun = await ensureSecondChanceForCompletedWheel(
      transaction,
      wheel.gameRound.gameRunId,
      wheel.id,
    );

    const unfinishedRoundWheels = await transaction.gameWheel.count({
      where: {
        gameRoundId: wheel.gameRoundId,
        id: { not: wheel.id },
        status: { not: "COMPLETED" },
      },
    });

    if (unfinishedRoundWheels === 0) {
      await transaction.gameRound.update({
        where: { id: wheel.gameRoundId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    }

    const unfinishedRunWheels = await transaction.gameWheel.count({
      where: {
        gameRound: {
          gameRunId: wheel.gameRound.gameRunId,
        },
        id: { not: wheel.id },
        status: { not: "COMPLETED" },
      },
    });

    let gameCompleted = false;

    if (unfinishedRunWheels === 0) {
      const completedAt = new Date();

      await transaction.gameRun.update({
        where: { id: wheel.gameRound.gameRunId },
        data: { completedAt },
      });

      await transaction.game.update({
        where: { id: gameId },
        data: { status: "COMPLETED" },
      });

      gameCompleted = true;
    }

    return {
      wheelId: wheel.id,
      winnerDisplayName: wheel.winnerDisplayName,
      winnerValue: wheel.winnerValue,
      gameCompleted,
      secondChance: secondChanceCompletionPayload(secondChanceRun),
    };
  });
}

export async function acceptGameWheelResult(
  wheelId: string,
  gameId: string,
  shop: string,
) {
  return db.$transaction(async (transaction) => {
    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: wheelId,
        gameRound: { gameRun: { gameId, game: { shop } } },
      },
    });
    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "COMPLETED" || wheel.winnerEntryIndex === null) {
      throw await staleWheel(transaction, wheel.id);
    }
    if (wheel.resultAcceptedAt) return wheel;
    const acceptedAt = new Date();
    const acceptance = await transaction.gameWheel.updateMany({
      where: { id: wheel.id, status: "COMPLETED", resultAcceptedAt: null },
      data: { resultAcceptedAt: acceptedAt },
    });
    if (acceptance.count === 0) {
      return transaction.gameWheel.findUniqueOrThrow({ where: { id: wheel.id } });
    }
    return transaction.gameWheel.findUniqueOrThrow({ where: { id: wheel.id } });
  });
}
