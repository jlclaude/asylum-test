import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { evaluateGameReadiness, type GameReadinessReport, type ReadinessSnapshot } from "../lib/game-readiness";
import { rewardChamberCanBeRepaired, rewardChamberEntries } from "../lib/reward-chamber";
import { getContainmentLabel, REWARD_CHAMBER_LABEL } from "../lib/wheel-labels";
import { completeGameWheelSpin, serializeWheelEntries } from "../models/game-run.server";
import { retrySerializableTransaction } from "../lib/prisma-transaction.server";

const SUPPORTED_AUDIO = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

function inspectMusicFolder(folder: string) {
  try {
    const files = readdirSync(resolve(process.cwd(), "public", "music", folder), { withFileTypes: true });
    let supported = 0;
    let unsupported = 0;
    for (const file of files) {
      if (!file.isFile()) continue;
      const dot = file.name.lastIndexOf(".");
      const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
      if (SUPPORTED_AUDIO.has(extension)) supported += 1;
      else unsupported += 1;
    }
    return { supported, unsupported, readable: true };
  } catch {
    return { supported: 0, unsupported: 0, readable: false };
  }
}

async function loadSnapshot(gameId: string, shop: string): Promise<ReadinessSnapshot | null> {
  const game = await db.game.findFirst({
    where: { id: gameId, shop },
    include: {
      claims: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      run: {
        include: {
          rounds: {
            orderBy: { position: "asc" },
            include: { wheels: { orderBy: { position: "asc" } } },
          },
        },
      },
      prizeClaims: true,
    },
  });
  if (!game) return null;
  const [settings, idleMusic, spinMusic] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop } }),
    Promise.resolve(inspectMusicFolder("pre-spin music")),
    Promise.resolve(inspectMusicFolder("spin music")),
  ]);
  const wheels = game.run?.rounds.flatMap((round) => round.wheels.map((wheel) => ({
    id: wheel.id,
    roundId: round.id,
    roundPosition: round.position,
    position: wheel.position,
    type: wheel.type,
    status: wheel.status,
    label: wheel.label,
    originalEntriesJson: wheel.originalEntriesJson,
    shuffledEntriesJson: wheel.shuffledEntriesJson,
    spinDurationSeconds: wheel.spinDurationSeconds,
    winnerEntryIndex: wheel.winnerEntryIndex,
    winnerClaimId: wheel.winnerClaimId,
    winnerDisplayName: wheel.winnerDisplayName,
    winnerValue: wheel.winnerValue,
    shuffledAt: wheel.shuffledAt?.toISOString() ?? null,
    spunAt: wheel.spunAt?.toISOString() ?? null,
    completedAt: wheel.completedAt?.toISOString() ?? null,
  }))) ?? [];
  return {
    game: {
      id: game.id,
      title: game.title,
      totalSpots: game.totalSpots,
      wheelCount: game.wheelCount,
      secondChanceOffset: game.secondChanceOffset,
      raffleYear: game.raffleYear,
      raffleNumber: game.raffleNumber,
      status: game.status,
      archivedAt: game.archivedAt?.toISOString() ?? null,
    },
    claims: game.claims.map((claim) => ({
      id: claim.id,
      displayName: claim.displayName,
      quantity: claim.quantity,
      status: claim.status,
      externalPayment: claim.externalPayment,
      createdAt: claim.createdAt.toISOString(),
    })),
    run: game.run ? {
      id: game.run.id,
      gameId: game.run.gameId,
      completedAt: game.run.completedAt?.toISOString() ?? null,
      secondChanceCalculatedAt: game.run.secondChanceCalculatedAt?.toISOString() ?? null,
      secondChanceSourceWheelId: game.run.secondChanceSourceWheelId,
      secondChanceBeforeDisplayName: game.run.secondChanceBeforeDisplayName,
      secondChanceBeforeEntryIndex: game.run.secondChanceBeforeEntryIndex,
      secondChanceAfterDisplayName: game.run.secondChanceAfterDisplayName,
      secondChanceAfterEntryIndex: game.run.secondChanceAfterEntryIndex,
      wheels,
    } : null,
    paymentInstructionsConfigured: Boolean(settings?.paymentInstructions?.trim()),
    music: {
      idleCount: idleMusic.supported,
      spinCount: spinMusic.supported,
      unsupportedCount: idleMusic.unsupported + spinMusic.unsupported,
      readable: idleMusic.readable && spinMusic.readable,
    },
    prizeClaims: game.prizeClaims.map((claim) => ({
      id: claim.id,
      gameId: claim.gameId,
      gameWheelId: claim.gameWheelId,
      activeGameWheelId: claim.activeGameWheelId,
      winnerDisplayName: claim.winnerDisplayName,
      tokenHash: claim.tokenHash,
    })),
    now: new Date().toISOString(),
  };
}

export async function runGameReadinessCheck(gameId: string, shop: string): Promise<GameReadinessReport> {
  const snapshot = await loadSnapshot(gameId, shop);
  if (!snapshot) throw new Error("Game not found.");
  const report = evaluateGameReadiness(snapshot);
  if (process.env.NODE_ENV === "development") {
    console.info("Game readiness checked", { gameId, shop, blocking: report.blockingCount, warnings: report.warningCount });
  }
  return report;
}

export type ReadinessRepairIntent = "repair-wheel-labels" | "repair-name-snapshots" |
  "repair-reward-chamber" | "reconcile-elapsed-spin";

export async function repairGameReadiness(input: {
  gameId: string;
  shop: string;
  intent: ReadinessRepairIntent;
  affectedId?: string;
}) {
  if (process.env.NODE_ENV === "development") console.info("Game readiness repair attempted", { gameId: input.gameId, intent: input.intent, affectedId: input.affectedId ?? null });
  if (input.intent === "reconcile-elapsed-spin") {
    if (!input.affectedId) throw new Error("Wheel ID is required.");
    const wheel = await db.gameWheel.findFirst({
      where: { id: input.affectedId, status: "SPINNING", gameRound: { gameRun: { gameId: input.gameId, game: { shop: input.shop } } } },
    });
    if (!wheel?.spunAt || !wheel.spinDurationSeconds || wheel.winnerEntryIndex === null) throw new Error("This spin does not contain safe recovery data.");
    if (Date.now() < wheel.spunAt.getTime() + wheel.spinDurationSeconds * 1000) throw new Error("This spin has not elapsed yet.");
    await completeGameWheelSpin(wheel.id, input.gameId, input.shop);
    return { message: `${wheel.label} reconciled using its persisted winner.` };
  }

  const message = await retrySerializableTransaction(() => db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({
      where: { id: input.gameId, shop: input.shop },
      include: {
        claims: { where: { status: "CONFIRMED", externalPayment: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        run: { include: { rounds: { orderBy: { position: "asc" }, include: { wheels: { orderBy: { position: "asc" } } } } } },
      },
    });
    if (!game) throw new Error("Game not found.");
    if (game.archivedAt) throw new Error("Archived games cannot be repaired.");
    const wheels = game.run?.rounds.flatMap((round) => round.wheels) ?? [];
    const allReady = wheels.length > 0 && wheels.every((wheel) => wheel.status === "READY" && wheel.winnerEntryIndex === null && !wheel.spunAt && !wheel.completedAt);

    if (input.intent === "repair-wheel-labels") {
      if (!allReady) throw new Error("This repair is blocked after any wheel begins spinning.");
      for (const wheel of wheels) {
        await transaction.gameWheel.update({
          where: { id: wheel.id },
          data: { label: wheel.type === "VALUE" ? REWARD_CHAMBER_LABEL : getContainmentLabel(wheel.position) },
        });
      }
      return `Restored ${wheels.length} deterministic wheel labels.`;
    }

    if (input.intent === "repair-name-snapshots") {
      if (!allReady) throw new Error("This repair is blocked after any wheel begins spinning.");
      if (game.run?.secondChanceCalculatedAt) throw new Error("Second Chance results already exist; snapshots are immutable.");
      const entries = game.claims.flatMap((claim) => Array.from({ length: claim.quantity }, () => ({ claimId: claim.id, displayName: claim.displayName })));
      if (entries.length === 0) throw new Error("At least one confirmed paid entry is required.");
      const nameWheels = wheels.filter((wheel) => wheel.type === "NAME");
      if (nameWheels.length !== game.wheelCount) throw new Error("Snapshot repair cannot create or delete missing wheels.");
      const json = serializeWheelEntries(entries);
      for (const wheel of nameWheels) {
        await transaction.gameWheel.update({ where: { id: wheel.id }, data: { originalEntriesJson: json, shuffledEntriesJson: json, shuffledAt: null, spinDurationSeconds: null } });
      }
      return `Rebuilt ${nameWheels.length} name-wheel snapshots with ${entries.length} chronological entries each.`;
    }

    const reward = wheels.find((wheel) => wheel.id === input.affectedId && wheel.type === "VALUE");
    if (!reward) throw new Error("Reward Chamber not found.");
    if (!rewardChamberCanBeRepaired(reward)) {
      throw new Error("Reward Chamber values cannot change after that wheel begins spinning.");
    }
    const json = serializeWheelEntries(rewardChamberEntries());
    await transaction.gameWheel.update({ where: { id: reward.id }, data: { originalEntriesJson: json, shuffledEntriesJson: json, shuffledAt: null, spinDurationSeconds: null } });
    return "Restored the exact 20-entry Reward Chamber weighting.";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  if (process.env.NODE_ENV === "development") console.info("Game readiness repair succeeded", { gameId: input.gameId, intent: input.intent, affectedId: input.affectedId ?? null });
  return { message };
}
