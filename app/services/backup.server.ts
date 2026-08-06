import { createHash, randomBytes } from "node:crypto";
import type { ClaimStatus, GameStatus, PrizeClaimStatus, RoundStatus, WheelStatus, WheelType } from "@prisma/client";
import db from "../db.server";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  RESTORE_CONFIRMATION,
  backupPreview,
  createBackupDocument,
  parseBackupJson,
  restoredPrizeClaimStatus,
  restoredRaffleSequences,
  type BackupData,
  type BackupDocument,
  type JsonValue,
} from "../lib/backup-format";
import { claimsCsv, prizeClaimsCsv, winnersCsv } from "../lib/csv-export";
import { formatRaffleCode } from "../lib/raffle-number";
import { normalizeDisplayNameForUniqueness } from "../lib/claim-display-name";

const SCHEMA_VERSION = "asylum-games-prisma-year-raffles-2026-08-04";
const iso = (value: Date | null) => value?.toISOString() ?? null;

function parseStoredJson(value: string | null, label: string): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new Error(`${label} contains malformed persisted JSON.`);
  }
}

async function loadShopData(shop: string): Promise<BackupData> {
  const [shopSettings, templates, games, prizeClaims, raffleSequences] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop } }),
    db.gameTemplate.findMany({ where: { shop }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.game.findMany({
      where: { shop },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        claims: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        run: { include: { rounds: { orderBy: { position: "asc" }, include: { wheels: { orderBy: { position: "asc" } } } } } },
      },
    }),
    db.prizeClaim.findMany({ where: { shop }, orderBy: [{ generatedAt: "asc" }, { id: "asc" }] }),
    db.shopRaffleSequence.findMany({ where: { shop }, orderBy: { year: "asc" } }),
  ]);

  const gameIds = new Set(games.map((game) => game.id));
  if (prizeClaims.some((claim) => !gameIds.has(claim.gameId))) {
    throw new Error("Shop data contains a prize claim with an invalid game relationship.");
  }

  return {
    shopSettings: shopSettings ? {
      id: shopSettings.id,
      paymentInstructions: shopSettings.paymentInstructions,
      createdAt: shopSettings.createdAt.toISOString(),
      updatedAt: shopSettings.updatedAt.toISOString(),
    } : null,
    templates: templates.map((item) => ({
      id: item.id, name: item.name, description: item.description,
      defaultGameTitle: item.defaultGameTitle, defaultGameDescription: item.defaultGameDescription,
      totalSpots: item.totalSpots, pricePerSpot: item.pricePerSpot.toString(),
      wheelCount: item.wheelCount, initialStatus: item.initialStatus, isDefault: item.isDefault,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
    games: games.map((item) => ({
      id: item.id, title: item.title, description: item.description, totalSpots: item.totalSpots,
      pricePerSpot: item.pricePerSpot.toString(), wheelCount: item.wheelCount,
      secondChanceOffset: item.secondChanceOffset, raffleYear: item.raffleYear,
      raffleNumber: item.raffleNumber,
      raffleCode: formatRaffleCode({ year: item.raffleYear, number: item.raffleNumber }),
      status: item.status, archivedAt: iso(item.archivedAt), createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    claims: games.flatMap((game) => game.claims.map((item) => ({
      id: item.id, gameId: item.gameId, displayName: item.displayName,
      facebookHandle: item.facebookHandle, quantity: item.quantity, comment: item.comment,
      status: item.status, externalPayment: item.externalPayment, expiresAt: iso(item.expiresAt),
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    }))),
    runs: games.flatMap((game) => game.run ? [{
      id: game.run.id, gameId: game.run.gameId, startedAt: game.run.startedAt.toISOString(),
      completedAt: iso(game.run.completedAt), secondChanceCalculatedAt: iso(game.run.secondChanceCalculatedAt),
      secondChanceSourceWheelId: game.run.secondChanceSourceWheelId,
      secondChanceBeforeClaimId: game.run.secondChanceBeforeClaimId,
      secondChanceBeforeDisplayName: game.run.secondChanceBeforeDisplayName,
      secondChanceBeforeEntryIndex: game.run.secondChanceBeforeEntryIndex,
      secondChanceAfterClaimId: game.run.secondChanceAfterClaimId,
      secondChanceAfterDisplayName: game.run.secondChanceAfterDisplayName,
      secondChanceAfterEntryIndex: game.run.secondChanceAfterEntryIndex,
    }] : []),
    rounds: games.flatMap((game) => game.run?.rounds.map((item) => ({
      id: item.id, gameRunId: item.gameRunId, position: item.position, title: item.title,
      status: item.status, startedAt: item.startedAt.toISOString(), completedAt: iso(item.completedAt),
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })) ?? []),
    wheels: games.flatMap((game) => game.run?.rounds.flatMap((round) => round.wheels.map((item) => ({
      id: item.id, gameRoundId: item.gameRoundId, position: item.position, type: item.type,
      status: item.status, label: item.label,
      originalEntries: parseStoredJson(item.originalEntriesJson, `${item.label} original entries`) as JsonValue,
      shuffledEntries: parseStoredJson(item.shuffledEntriesJson, `${item.label} shuffled entries`) as JsonValue,
      spinDurationSeconds: item.spinDurationSeconds, winnerEntryIndex: item.winnerEntryIndex,
      winnerClaimId: item.winnerClaimId, winnerDisplayName: item.winnerDisplayName,
      winnerValue: item.winnerValue, shuffledAt: iso(item.shuffledAt), spunAt: iso(item.spunAt),
      completedAt: iso(item.completedAt), resultAcceptedAt: iso(item.resultAcceptedAt),
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    }))) ?? []),
    prizeClaims: prizeClaims.map((item) => ({
      id: item.id, gameId: item.gameId, gameWheelId: item.gameWheelId,
      winnerClaimId: item.winnerClaimId, winnerDisplayName: item.winnerDisplayName,
      wheelLabel: item.wheelLabel, status: item.status, expiresAt: iso(item.expiresAt),
      generatedAt: item.generatedAt.toISOString(), submittedAt: iso(item.submittedAt),
      reviewedAt: iso(item.reviewedAt), fulfilledAt: iso(item.fulfilledAt), revokedAt: iso(item.revokedAt),
      preferredPrize: item.preferredPrize,
      prizeOptions: parseStoredJson(item.prizeOptionsJson, "Prize options"),
      selectedPrizeOptionId: item.selectedPrizeOptionId,
      selectedPrizeOptionLabel: item.selectedPrizeOptionLabel,
      selectedPrizeOption: parseStoredJson(item.selectedPrizeOptionJson, "Selected prize option"),
      selectedBalls: parseStoredJson(item.selectedBallsJson, "Selected balls"),
      recipientName: item.recipientName, addressLine1: item.addressLine1, addressLine2: item.addressLine2,
      city: item.city, stateProvince: item.stateProvince, postalCode: item.postalCode,
      country: item.country, winnerNotes: item.winnerNotes, adminNotes: item.adminNotes,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
    raffleSequences: raffleSequences.map((sequence) => ({
      id: sequence.id, year: sequence.year, nextValue: sequence.nextValue,
      createdAt: sequence.createdAt.toISOString(), updatedAt: sequence.updatedAt.toISOString(),
    })),
  };
}

export async function createEmergencyBackup(shop: string) {
  return createBackupDocument({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    shop,
    schemaVersion: SCHEMA_VERSION,
    data: await loadShopData(shop),
  });
}

export async function listBackupGames(shop: string) {
  return db.game.findMany({
    where: { shop },
    select: { id: true, raffleYear: true, raffleNumber: true, title: true, status: true, archivedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

async function exportGames(shop: string, gameId?: string) {
  if (gameId) {
    const owned = await db.game.findFirst({ where: { id: gameId, shop }, select: { id: true } });
    if (!owned) throw new Response("Raffle not found.", { status: 404 });
  }
  return db.game.findMany({
    where: { shop, ...(gameId ? { id: gameId } : {}) },
    include: {
      claims: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      run: { include: { rounds: { orderBy: { position: "asc" }, include: { wheels: { orderBy: { position: "asc" } } } } } },
      prizeClaims: { select: { status: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function createRaffleJson(shop: string, gameId: string) {
  const game = (await exportGames(shop, gameId))[0];
  return {
    format: "asylum-games-raffle-export",
    version: 2,
    exportedAt: new Date().toISOString(),
    raffle: {
      raffleYear: game.raffleYear, raffleNumber: game.raffleNumber,
      raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }), title: game.title, description: game.description,
      totalSpots: game.totalSpots, pricePerSpot: game.pricePerSpot.toString(), status: game.status,
      archivedAt: iso(game.archivedAt), createdAt: game.createdAt.toISOString(), updatedAt: game.updatedAt.toISOString(),
      claims: game.claims.map((claim, index) => ({
        sequence: index + 1, displayName: claim.displayName, quantity: claim.quantity,
        status: claim.status, externalPayment: claim.externalPayment, comment: claim.comment,
        createdAt: claim.createdAt.toISOString(), updatedAt: claim.updatedAt.toISOString(),
      })),
      run: game.run ? {
        startedAt: game.run.startedAt.toISOString(), completedAt: iso(game.run.completedAt),
        secondChanceOffset: game.secondChanceOffset,
        secondChanceBeforeDisplayName: game.run.secondChanceBeforeDisplayName,
        secondChanceAfterDisplayName: game.run.secondChanceAfterDisplayName,
        rounds: game.run.rounds.map((round) => ({
          position: round.position, title: round.title, status: round.status,
          wheels: round.wheels.map((wheel) => ({
            position: wheel.position, type: wheel.type, status: wheel.status, label: wheel.label,
            originalEntries: parseStoredJson(wheel.originalEntriesJson, `${wheel.label} original entries`),
            shuffledEntries: parseStoredJson(wheel.shuffledEntriesJson, `${wheel.label} shuffled entries`),
            spinDurationSeconds: wheel.spinDurationSeconds, winnerDisplayName: wheel.winnerDisplayName,
            winnerValue: wheel.winnerValue, spunAt: iso(wheel.spunAt), completedAt: iso(wheel.completedAt),
            resultAcceptedAt: iso(wheel.resultAcceptedAt),
          })),
        })),
      } : null,
      prizeClaimStatuses: game.prizeClaims.reduce<Record<string, number>>((counts, claim) => {
        counts[claim.status] = (counts[claim.status] ?? 0) + 1; return counts;
      }, {}),
    },
  };
}

export async function createClaimsCsv(shop: string, gameId?: string) {
  const games = await exportGames(shop, gameId);
  return claimsCsv(games.map((game) => ({
    raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }), gameTitle: game.title,
    claims: game.claims.map((claim) => ({ ...claim, createdAt: claim.createdAt.toISOString() })),
  })));
}

export async function createWinnersCsv(shop: string, gameId?: string) {
  const games = await exportGames(shop, gameId);
  return winnersCsv(games.map((game) => ({
    raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }), gameTitle: game.title,
    archived: Boolean(game.archivedAt), secondChanceOffset: game.secondChanceOffset,
    run: game.run ? {
      secondChanceBeforeDisplayName: game.run.secondChanceBeforeDisplayName,
      secondChanceAfterDisplayName: game.run.secondChanceAfterDisplayName,
      rounds: game.run.rounds.map((round) => ({
        position: round.position, title: round.title,
        wheels: round.wheels.map((wheel) => ({
          position: wheel.position, label: wheel.label, type: wheel.type,
          winnerDisplayName: wheel.winnerDisplayName, winnerValue: wheel.winnerValue,
          completedAt: iso(wheel.completedAt), spinDurationSeconds: wheel.spinDurationSeconds,
        })),
      })),
    } : null,
  })));
}

export async function createPrizeClaimsCsv(shop: string) {
  const claims = await db.prizeClaim.findMany({
    where: { shop }, include: { game: { select: { raffleYear: true, raffleNumber: true, title: true } } },
    orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
  });
  return prizeClaimsCsv(claims.map((claim) => {
    const selected = parseStoredJson(claim.selectedBallsJson, "Selected balls");
    return {
      raffleCode: formatRaffleCode({ year: claim.game.raffleYear, number: claim.game.raffleNumber }), gameTitle: claim.game.title,
      winnerDisplayName: claim.winnerDisplayName, wheelLabel: claim.wheelLabel, status: claim.status,
      selectedPrizeOptionLabel: claim.selectedPrizeOptionLabel,
      selectedBalls: Array.isArray(selected) ? selected as Array<{ title?: string; productTitle?: string; weight?: string | number | null }> : [],
      recipientName: claim.recipientName, addressLine1: claim.addressLine1, addressLine2: claim.addressLine2,
      city: claim.city, stateProvince: claim.stateProvince, postalCode: claim.postalCode,
      country: claim.country, winnerNotes: claim.winnerNotes, generatedAt: claim.generatedAt.toISOString(),
      submittedAt: iso(claim.submittedAt), reviewedAt: iso(claim.reviewedAt), fulfilledAt: iso(claim.fulfilledAt),
    };
  }));
}

function value(record: Record<string, JsonValue>, field: string) { return record[field]; }
const stringValue = (record: Record<string, JsonValue>, field: string) => String(value(record, field));
const nullableString = (record: Record<string, JsonValue>, field: string) => value(record, field) === null ? null : String(value(record, field));
const numberValue = (record: Record<string, JsonValue>, field: string) => Number(value(record, field));
const nullableNumber = (record: Record<string, JsonValue>, field: string) => value(record, field) === null ? null : Number(value(record, field));
const boolValue = (record: Record<string, JsonValue>, field: string) => Boolean(value(record, field));
const dateValue = (record: Record<string, JsonValue>, field: string) => new Date(stringValue(record, field));
const nullableDate = (record: Record<string, JsonValue>, field: string) => value(record, field) === null ? null : new Date(stringValue(record, field));
const jsonValue = (record: Record<string, JsonValue>, field: string) => value(record, field) === null ? null : JSON.stringify(value(record, field));

async function destinationState(shop: string) {
  const [games, templates, settings, sequence, prizeClaims] = await Promise.all([
    db.game.count({ where: { shop } }), db.gameTemplate.count({ where: { shop } }),
    db.shopSettings.count({ where: { shop } }), db.shopRaffleSequence.count({ where: { shop } }),
    db.prizeClaim.count({ where: { shop } }),
  ]);
  return { games, templates, settings, sequence, prizeClaims, empty: games + templates + settings + sequence + prizeClaims === 0 };
}

async function conflictingIds(document: BackupDocument) {
  const data = document.data;
  const checks = await Promise.all([
    data.shopSettings ? db.shopSettings.count({ where: { id: String(data.shopSettings.id) } }) : 0,
    data.templates.length ? db.gameTemplate.count({ where: { id: { in: data.templates.map((item) => String(item.id)) } } }) : 0,
    data.games.length ? db.game.count({ where: { id: { in: data.games.map((item) => String(item.id)) } } }) : 0,
    data.claims.length ? db.claim.count({ where: { id: { in: data.claims.map((item) => String(item.id)) } } }) : 0,
    data.runs.length ? db.gameRun.count({ where: { id: { in: data.runs.map((item) => String(item.id)) } } }) : 0,
    data.rounds.length ? db.gameRound.count({ where: { id: { in: data.rounds.map((item) => String(item.id)) } } }) : 0,
    data.wheels.length ? db.gameWheel.count({ where: { id: { in: data.wheels.map((item) => String(item.id)) } } }) : 0,
    data.prizeClaims.length ? db.prizeClaim.count({ where: { id: { in: data.prizeClaims.map((item) => String(item.id)) } } }) : 0,
    data.raffleSequences.length ? db.shopRaffleSequence.count({ where: { id: { in: data.raffleSequences.map((item) => String(item.id)) } } }) : 0,
  ]);
  return checks.reduce((sum, count) => sum + count, 0);
}

export async function previewBackupRestore(text: string, shop: string) {
  const document = parseBackupJson(text, shop);
  const [state, conflicts] = await Promise.all([destinationState(shop), conflictingIds(document)]);
  return {
    document,
    preview: backupPreview(document),
    conflicts: [
      ...(!state.empty ? ["The destination shop already contains application data. Empty-shop restore is required."] : []),
      ...(conflicts ? [`${conflicts} preserved record IDs conflict with existing database records.`] : []),
    ],
  };
}

export async function restoreEmergencyBackup(input: { text: string; shop: string; confirmation: string }) {
  if (input.confirmation !== RESTORE_CONFIRMATION) throw new Error(`Type ${RESTORE_CONFIRMATION} to confirm restore.`);
  const checked = await previewBackupRestore(input.text, input.shop);
  if (checked.conflicts.length) throw new Error(checked.conflicts.join(" "));
  const data = checked.document.data;
  await db.$transaction(async (transaction) => {
    const [gameCount, templateCount, settingsCount, sequenceCount, prizeCount] = await Promise.all([
      transaction.game.count({ where: { shop: input.shop } }),
      transaction.gameTemplate.count({ where: { shop: input.shop } }),
      transaction.shopSettings.count({ where: { shop: input.shop } }),
      transaction.shopRaffleSequence.count({ where: { shop: input.shop } }),
      transaction.prizeClaim.count({ where: { shop: input.shop } }),
    ]);
    if (gameCount + templateCount + settingsCount + sequenceCount + prizeCount !== 0) {
      throw new Error("Destination shop is no longer empty. Nothing was restored.");
    }
    if (data.shopSettings) await transaction.shopSettings.create({ data: {
      id: stringValue(data.shopSettings, "id"), shop: input.shop,
      paymentInstructions: nullableString(data.shopSettings, "paymentInstructions"),
      createdAt: dateValue(data.shopSettings, "createdAt"), updatedAt: dateValue(data.shopSettings, "updatedAt"),
    } });
    for (const item of data.templates) await transaction.gameTemplate.create({ data: {
      id: stringValue(item, "id"), shop: input.shop, name: stringValue(item, "name"),
      description: nullableString(item, "description"), defaultGameTitle: nullableString(item, "defaultGameTitle"),
      defaultGameDescription: nullableString(item, "defaultGameDescription"), totalSpots: numberValue(item, "totalSpots"),
      pricePerSpot: stringValue(item, "pricePerSpot"), wheelCount: numberValue(item, "wheelCount"),
      initialStatus: stringValue(item, "initialStatus") as GameStatus,
      isDefault: boolValue(item, "isDefault"), createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
    } });
    for (const item of data.games) await transaction.game.create({ data: {
      id: stringValue(item, "id"), shop: input.shop, title: stringValue(item, "title"),
      description: nullableString(item, "description"), totalSpots: numberValue(item, "totalSpots"),
      pricePerSpot: stringValue(item, "pricePerSpot"), wheelCount: numberValue(item, "wheelCount"),
      secondChanceOffset: numberValue(item, "secondChanceOffset"), raffleYear: numberValue(item, "raffleYear"),
      raffleNumber: numberValue(item, "raffleNumber"),
      status: stringValue(item, "status") as GameStatus,
      archivedAt: nullableDate(item, "archivedAt"), createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
    } });
    for (const item of data.claims) await transaction.claim.create({ data: {
      id: stringValue(item, "id"), gameId: stringValue(item, "gameId"), displayName: stringValue(item, "displayName"),
      normalizedDisplayName: normalizeDisplayNameForUniqueness(stringValue(item, "displayName")),
      facebookHandle: nullableString(item, "facebookHandle"), quantity: numberValue(item, "quantity"),
      comment: nullableString(item, "comment"), status: stringValue(item, "status") as ClaimStatus,
      externalPayment: boolValue(item, "externalPayment"), expiresAt: nullableDate(item, "expiresAt"),
      createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
    } });
    const restoredActiveClaims = await transaction.claim.findMany({
      where: {
        game: { shop: input.shop },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const reservedNames = new Set<string>();
    for (const claim of restoredActiveClaims) {
      const normalizedDisplayName = normalizeDisplayNameForUniqueness(
        claim.displayName,
      );
      const key = `${claim.gameId}\u0000${normalizedDisplayName}`;
      if (!normalizedDisplayName || reservedNames.has(key)) continue;
      reservedNames.add(key);
      await transaction.claimNameReservation.create({
        data: { claimId: claim.id, gameId: claim.gameId, normalizedDisplayName },
      });
    }
    for (const item of data.runs) await transaction.gameRun.create({ data: {
      id: stringValue(item, "id"), gameId: stringValue(item, "gameId"), startedAt: dateValue(item, "startedAt"),
      completedAt: nullableDate(item, "completedAt"), secondChanceCalculatedAt: nullableDate(item, "secondChanceCalculatedAt"),
      secondChanceSourceWheelId: nullableString(item, "secondChanceSourceWheelId"),
      secondChanceBeforeClaimId: nullableString(item, "secondChanceBeforeClaimId"),
      secondChanceBeforeDisplayName: nullableString(item, "secondChanceBeforeDisplayName"),
      secondChanceBeforeEntryIndex: nullableNumber(item, "secondChanceBeforeEntryIndex"),
      secondChanceAfterClaimId: nullableString(item, "secondChanceAfterClaimId"),
      secondChanceAfterDisplayName: nullableString(item, "secondChanceAfterDisplayName"),
      secondChanceAfterEntryIndex: nullableNumber(item, "secondChanceAfterEntryIndex"),
    } });
    for (const item of data.rounds) await transaction.gameRound.create({ data: {
      id: stringValue(item, "id"), gameRunId: stringValue(item, "gameRunId"), position: numberValue(item, "position"),
      title: nullableString(item, "title"), status: stringValue(item, "status") as RoundStatus,
      startedAt: dateValue(item, "startedAt"), completedAt: nullableDate(item, "completedAt"),
      createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
    } });
    for (const item of data.wheels) await transaction.gameWheel.create({ data: {
      id: stringValue(item, "id"), gameRoundId: stringValue(item, "gameRoundId"), position: numberValue(item, "position"),
      type: stringValue(item, "type") as WheelType,
      status: stringValue(item, "status") as WheelStatus, label: stringValue(item, "label"),
      originalEntriesJson: jsonValue(item, "originalEntries") ?? "[]", shuffledEntriesJson: jsonValue(item, "shuffledEntries") ?? "[]",
      spinDurationSeconds: nullableNumber(item, "spinDurationSeconds"), winnerEntryIndex: nullableNumber(item, "winnerEntryIndex"),
      winnerClaimId: nullableString(item, "winnerClaimId"), winnerDisplayName: nullableString(item, "winnerDisplayName"),
      winnerValue: nullableString(item, "winnerValue"), shuffledAt: nullableDate(item, "shuffledAt"), spunAt: nullableDate(item, "spunAt"),
      completedAt: nullableDate(item, "completedAt"), resultAcceptedAt: nullableDate(item, "resultAcceptedAt"),
      createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
    } });
    for (const item of data.prizeClaims) {
      const wasOpen = stringValue(item, "status") === "OPEN";
      const placeholder = createHash("sha256").update(randomBytes(32)).digest("hex");
      await transaction.prizeClaim.create({ data: {
        id: stringValue(item, "id"), shop: input.shop, gameId: stringValue(item, "gameId"),
        gameWheelId: stringValue(item, "gameWheelId"), activeGameWheelId: null,
        winnerClaimId: nullableString(item, "winnerClaimId"), winnerDisplayName: stringValue(item, "winnerDisplayName"),
        wheelLabel: stringValue(item, "wheelLabel"), tokenHash: placeholder, tokenLastFour: "----", encryptedToken: null,
        status: restoredPrizeClaimStatus(stringValue(item, "status")) as PrizeClaimStatus,
        expiresAt: nullableDate(item, "expiresAt"), generatedAt: dateValue(item, "generatedAt"),
        submittedAt: nullableDate(item, "submittedAt"), reviewedAt: nullableDate(item, "reviewedAt"),
        fulfilledAt: nullableDate(item, "fulfilledAt"), revokedAt: wasOpen ? new Date() : nullableDate(item, "revokedAt"),
        preferredPrize: nullableString(item, "preferredPrize"), prizeOptionsJson: jsonValue(item, "prizeOptions"),
        selectedPrizeOptionId: nullableString(item, "selectedPrizeOptionId"),
        selectedPrizeOptionLabel: nullableString(item, "selectedPrizeOptionLabel"),
        selectedPrizeOptionJson: jsonValue(item, "selectedPrizeOption"), selectedBallsJson: jsonValue(item, "selectedBalls"),
        recipientName: nullableString(item, "recipientName"), addressLine1: nullableString(item, "addressLine1"),
        addressLine2: nullableString(item, "addressLine2"), city: nullableString(item, "city"),
        stateProvince: nullableString(item, "stateProvince"), postalCode: nullableString(item, "postalCode"),
        country: nullableString(item, "country"), winnerNotes: nullableString(item, "winnerNotes"),
        adminNotes: nullableString(item, "adminNotes"), createdAt: dateValue(item, "createdAt"), updatedAt: dateValue(item, "updatedAt"),
      } });
    }
    const restoredSequences = restoredRaffleSequences(data.games, data.raffleSequences);
    for (const restored of restoredSequences) {
      const saved = data.raffleSequences.find((sequence) => numberValue(sequence, "year") === restored.year);
      await transaction.shopRaffleSequence.create({ data: {
        id: saved ? stringValue(saved, "id") : `restored_sequence_${randomBytes(12).toString("hex")}`,
        shop: input.shop, year: restored.year, nextValue: restored.nextValue,
        createdAt: saved ? dateValue(saved, "createdAt") : new Date(),
        updatedAt: saved ? dateValue(saved, "updatedAt") : new Date(),
      } });
    }
  }, { maxWait: 5_000, timeout: 60_000 });
  return backupPreview(checked.document);
}
