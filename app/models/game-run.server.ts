import { randomInt } from "node:crypto";
import db from "../db.server";

export type NameWheelEntry = {
  claimId: string;
  displayName: string;
};

export type ValueWheelEntry = {
  value: string;
};

export type WheelEntry = NameWheelEntry | ValueWheelEntry;

const VALUE_WHEEL_ENTRIES: ValueWheelEntry[] = [
  { value: "12.5" }, { value: "12.5" }, { value: "12.5" },
  { value: "12.5" }, { value: "12.5" }, { value: "12.5" },
  { value: "25" }, { value: "25" }, { value: "25" },
  { value: "25" }, { value: "25" }, { value: "25" },
  { value: "37.5" }, { value: "37.5" },
  { value: "50" }, { value: "75" }, { value: "100" },
  { value: "125" }, { value: "250" },
];

function serializeEntries(entries: WheelEntry[]) {
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
  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({
      where: { id: gameId, shop },
    });

    if (!game) throw new Error("Game not found.");
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

    const namesJson = serializeEntries(nameEntries);

    for (let index = 0; index < game.wheelCount; index += 1) {
      await transaction.gameWheel.create({
        data: {
          gameRoundId: round.id,
          position: index + 1,
          type: "NAME",
          label: `Name Wheel ${index + 1}`,
          originalEntriesJson: namesJson,
          shuffledEntriesJson: namesJson,
        },
      });
    }

    const valuesJson = serializeEntries(VALUE_WHEEL_ENTRIES);

    await transaction.gameWheel.create({
      data: {
        gameRoundId: round.id,
        position: game.wheelCount + 1,
        type: "VALUE",
        label: "Value Wheel",
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
  });
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
            game: { shop },
          },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "READY") {
      throw new Error("This wheel can no longer be shuffled.");
    }

    const shuffled = secureShuffle(
      deserializeWheelEntries(wheel.shuffledEntriesJson),
    );

    return transaction.gameWheel.update({
      where: { id: wheel.id },
      data: {
        shuffledEntriesJson: serializeEntries(shuffled),
        shuffledAt: new Date(),
      },
    });
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
            game: { shop },
          },
        },
      },
    });

    if (!wheel) throw new Error("Wheel not found.");
    if (wheel.status !== "READY") {
      throw new Error("Spin time can only be selected for a ready wheel.");
    }

    const spinDurationSeconds = randomInt(30, 121);

    await transaction.gameWheel.update({
      where: { id: wheel.id },
      data: { spinDurationSeconds },
    });

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
            game: { shop },
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
      throw new Error("This wheel is not ready to spin.");
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

    await transaction.gameWheel.update({
      where: { id: wheel.id },
      data: {
        status: "SPINNING",
        winnerEntryIndex,
        winnerClaimId,
        winnerDisplayName,
        winnerValue,
        spunAt,
      },
    });

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
            game: { shop },
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
      throw new Error("No saved result exists for this wheel.");
    }

    if (wheel.status === "COMPLETED") {
      return {
        wheelId: wheel.id,
        winnerDisplayName: wheel.winnerDisplayName,
        winnerValue: wheel.winnerValue,
        gameCompleted: wheel.gameRound.gameRun.completedAt !== null,
      };
    }

    await transaction.gameWheel.update({
      where: { id: wheel.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

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
    };
  });
}
