import { createHash } from "node:crypto";
export { BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, RESTORE_CONFIRMATION } from "./backup-constants.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, LEGACY_BACKUP_VERSION, MAX_BACKUP_BYTES } from "./backup-constants.ts";
import { formatRaffleCode, getCurrentRaffleYear, isValidRaffleYear } from "./raffle-number.ts";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type BackupData = {
  shopSettings: null | Record<string, JsonValue>;
  templates: Array<Record<string, JsonValue>>;
  games: Array<Record<string, JsonValue>>;
  claims: Array<Record<string, JsonValue>>;
  runs: Array<Record<string, JsonValue>>;
  rounds: Array<Record<string, JsonValue>>;
  wheels: Array<Record<string, JsonValue>>;
  prizeClaims: Array<Record<string, JsonValue>>;
  raffleSequences: Array<Record<string, JsonValue>>;
};

export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  shop: string;
  schemaVersion: string;
  data: BackupData;
};

export type BackupDocument = BackupPayload & { checksum: string };

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ROOT_KEYS = ["checksum", "data", "exportedAt", "format", "schemaVersion", "shop", "version"];
const DATA_KEYS = ["claims", "games", "prizeClaims", "raffleSequences", "rounds", "runs", "shopSettings", "templates", "wheels"];
const LEGACY_DATA_KEYS = ["claims", "games", "prizeClaims", "raffleSequence", "rounds", "runs", "shopSettings", "templates", "wheels"];
const GAME_KEYS = ["archivedAt", "createdAt", "description", "id", "pricePerSpot", "raffleCode", "raffleNumber", "raffleYear", "secondChanceOffset", "status", "title", "totalSpots", "updatedAt", "wheelCount"];
const LEGACY_GAME_KEYS = ["archivedAt", "createdAt", "description", "id", "pricePerSpot", "raffleNumber", "secondChanceOffset", "status", "title", "totalSpots", "updatedAt", "wheelCount"];
const TEMPLATE_KEYS = ["createdAt", "defaultGameDescription", "defaultGameTitle", "description", "id", "initialStatus", "isDefault", "name", "pricePerSpot", "totalSpots", "updatedAt", "wheelCount"];
const CLAIM_KEYS = ["comment", "createdAt", "displayName", "expiresAt", "externalPayment", "facebookHandle", "gameId", "id", "quantity", "status", "updatedAt"];
const RUN_KEYS = ["completedAt", "gameId", "id", "secondChanceAfterClaimId", "secondChanceAfterDisplayName", "secondChanceAfterEntryIndex", "secondChanceBeforeClaimId", "secondChanceBeforeDisplayName", "secondChanceBeforeEntryIndex", "secondChanceCalculatedAt", "secondChanceSourceWheelId", "startedAt"];
const ROUND_KEYS = ["completedAt", "createdAt", "gameRunId", "id", "position", "startedAt", "status", "title", "updatedAt"];
const WHEEL_KEYS = ["completedAt", "createdAt", "gameRoundId", "id", "label", "originalEntries", "position", "resultAcceptedAt", "shuffledAt", "shuffledEntries", "spinDurationSeconds", "spunAt", "status", "type", "updatedAt", "winnerClaimId", "winnerDisplayName", "winnerEntryIndex", "winnerValue"];
const PRIZE_KEYS = ["addressLine1", "addressLine2", "adminNotes", "city", "country", "createdAt", "expiresAt", "fulfilledAt", "gameId", "gameWheelId", "generatedAt", "id", "postalCode", "preferredPrize", "prizeOptions", "recipientName", "reviewedAt", "revokedAt", "selectedBalls", "selectedPrizeOption", "selectedPrizeOptionId", "selectedPrizeOptionLabel", "stateProvince", "status", "submittedAt", "updatedAt", "wheelLabel", "winnerClaimId", "winnerDisplayName", "winnerNotes"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeObject(value: unknown, path = "backup") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeObject(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Unsafe field found at ${path}.${key}.`);
    assertSafeObject(item, `${path}.${key}`);
  }
}

export function canonicalJson(value: unknown): string {
  assertSafeObject(value);
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function backupChecksum(payload: unknown) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function createBackupDocument(payload: BackupPayload): BackupDocument {
  return { ...payload, checksum: backupChecksum(payload) };
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string) {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} contains missing or unexpected fields.`);
  }
}

function requiredString(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (typeof value !== "string" || !value) throw new Error(`${label}.${field} must be a non-empty string.`);
  return value;
}

function optionalString(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (value !== null && typeof value !== "string") throw new Error(`${label}.${field} must be a string or null.`);
}

function requiredInteger(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (!Number.isInteger(value)) throw new Error(`${label}.${field} must be a whole number.`);
  return value as number;
}

function optionalInteger(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (value !== null && !Number.isInteger(value)) throw new Error(`${label}.${field} must be a whole number or null.`);
}

function requiredBoolean(record: Record<string, unknown>, field: string, label: string) {
  if (typeof record[field] !== "boolean") throw new Error(`${label}.${field} must be true or false.`);
}

function dateString(value: unknown, label: string, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO date${nullable ? " or null" : ""}.`);
  }
}

function decimalString(value: unknown, label: string) {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`${label} must be a valid decimal string.`);
  }
}

function enumValue(value: unknown, allowed: readonly string[], label: string) {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} is invalid.`);
}

function recordArray(data: Record<string, unknown>, field: keyof BackupData) {
  const value = data[field];
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`data.${field} must be an array of objects.`);
  return value as Array<Record<string, unknown>>;
}

function validateRecordBasics(records: Array<Record<string, unknown>>, label: string) {
  const ids = new Set<string>();
  records.forEach((record, index) => {
    const item = `${label}[${index}]`;
    const id = requiredString(record, "id", item);
    if (ids.has(id)) throw new Error(`${label} contains duplicate ID ${id}.`);
    ids.add(id);
    dateString(record.createdAt, `${item}.createdAt`);
    dateString(record.updatedAt, `${item}.updatedAt`);
  });
  return ids;
}

export function parseBackupJson(text: string, expectedShop: string): BackupDocument {
  if (Buffer.byteLength(text, "utf8") > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 10 MB upload limit.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error("Backup is not valid JSON."); }
  assertSafeObject(input);
  if (!isRecord(input)) throw new Error("Backup root must be an object.");
  exactKeys(input, ROOT_KEYS, "Backup root");
  if (input.format !== BACKUP_FORMAT) throw new Error("Unsupported backup format.");
  if (input.version !== BACKUP_VERSION && input.version !== LEGACY_BACKUP_VERSION) throw new Error("Unsupported backup version.");
  if (input.shop !== expectedShop) throw new Error("This backup belongs to a different Shopify shop.");
  requiredString(input, "schemaVersion", "backup");
  dateString(input.exportedAt, "backup.exportedAt");
  if (typeof input.checksum !== "string" || !/^[a-f0-9]{64}$/.test(input.checksum)) throw new Error("Backup checksum is missing or malformed.");
  if (!isRecord(input.data)) throw new Error("Backup data must be an object.");
  const version = input.version as number;
  exactKeys(input.data, version === LEGACY_BACKUP_VERSION ? LEGACY_DATA_KEYS : DATA_KEYS, "Backup data");
  const payload = {
    format: input.format,
    version: input.version,
    exportedAt: input.exportedAt,
    shop: input.shop,
    schemaVersion: input.schemaVersion,
    data: input.data,
  };
  if (backupChecksum(payload) !== input.checksum) throw new Error("Backup checksum does not match its contents.");
  validateBackupData(input.data, version);
  const data = version === LEGACY_BACKUP_VERSION
    ? normalizeLegacyBackupData(input.data, String(input.exportedAt))
    : input.data as BackupData;
  return { ...payload, version: BACKUP_VERSION, data, checksum: input.checksum } as BackupDocument;
}

export function validateBackupData(data: Record<string, unknown>, version = BACKUP_VERSION) {
  const games = recordArray(data, "games");
  const templates = recordArray(data, "templates");
  const claims = recordArray(data, "claims");
  const runs = recordArray(data, "runs");
  const rounds = recordArray(data, "rounds");
  const wheels = recordArray(data, "wheels");
  const prizeClaims = recordArray(data, "prizeClaims");
  const gameIds = validateRecordBasics(games, "games");
  validateRecordBasics(templates, "templates");
  const claimIds = validateRecordBasics(claims, "claims");
  const runIds = new Set<string>();
  const roundIds = validateRecordBasics(rounds, "rounds");
  const wheelIds = validateRecordBasics(wheels, "wheels");
  validateRecordBasics(prizeClaims, "prizeClaims");

  const raffleNumbers = new Set<string>();
  const claimGameIds = new Map<string, string>();
  const runGameIds = new Map<string, string>();
  const roundRunIds = new Map<string, string>();
  const wheelRoundIds = new Map<string, string>();
  games.forEach((game, index) => {
    const label = `games[${index}]`;
    exactKeys(game, version === LEGACY_BACKUP_VERSION ? LEGACY_GAME_KEYS : GAME_KEYS, label);
    const raffleYear = version === LEGACY_BACKUP_VERSION
      ? getCurrentRaffleYear(new Date(requiredString(game, "createdAt", label)))
      : requiredInteger(game, "raffleYear", label);
    const raffle = requiredInteger(game, "raffleNumber", label);
    const raffleKey = `${raffleYear}:${raffle}`;
    if (raffleNumbers.has(raffleKey)) throw new Error(`Duplicate raffle identity ${raffleYear}-${raffle}.`);
    raffleNumbers.add(raffleKey);
    if (!isValidRaffleYear(raffleYear) || raffle < 1 || raffle > 999999) throw new Error(`${label} has an invalid raffle identity.`);
    if (version !== LEGACY_BACKUP_VERSION && game.raffleCode !== formatRaffleCode({ year: raffleYear, number: raffle })) {
      throw new Error(`${label}.raffleCode does not match its structured identity.`);
    }
    requiredString(game, "title", label); optionalString(game, "description", label);
    requiredInteger(game, "totalSpots", label); decimalString(game.pricePerSpot, `${label}.pricePerSpot`);
    requiredInteger(game, "wheelCount", label); requiredInteger(game, "secondChanceOffset", label);
    enumValue(game.status, ["OPEN", "CLOSED", "READY", "IN_PROGRESS", "COMPLETED"], `${label}.status`);
    dateString(game.archivedAt, `${label}.archivedAt`, true);
  });
  templates.forEach((item, index) => {
    const label = `templates[${index}]`;
    exactKeys(item, TEMPLATE_KEYS, label);
    requiredString(item, "name", label); optionalString(item, "description", label);
    optionalString(item, "defaultGameTitle", label); optionalString(item, "defaultGameDescription", label);
    requiredInteger(item, "totalSpots", label); decimalString(item.pricePerSpot, `${label}.pricePerSpot`);
    requiredInteger(item, "wheelCount", label); requiredBoolean(item, "isDefault", label);
    enumValue(item.initialStatus, ["OPEN", "CLOSED"], `${label}.initialStatus`);
  });
  claims.forEach((item, index) => {
    const label = `claims[${index}]`;
    exactKeys(item, CLAIM_KEYS, label);
    const gameId = requiredString(item, "gameId", label);
    if (!gameIds.has(gameId)) throw new Error(`${label} references a missing game.`);
    claimGameIds.set(String(item.id), gameId);
    requiredString(item, "displayName", label); optionalString(item, "facebookHandle", label); optionalString(item, "comment", label);
    requiredInteger(item, "quantity", label); requiredBoolean(item, "externalPayment", label);
    enumValue(item.status, ["PENDING", "CONFIRMED", "CANCELED", "EXPIRED"], `${label}.status`);
    dateString(item.expiresAt, `${label}.expiresAt`, true);
  });
  runs.forEach((item, index) => {
    const label = `runs[${index}]`;
    exactKeys(item, RUN_KEYS, label);
    const id = requiredString(item, "id", label);
    if (runIds.has(id)) throw new Error(`runs contains duplicate ID ${id}.`); runIds.add(id);
    const gameId = requiredString(item, "gameId", label);
    if (!gameIds.has(gameId)) throw new Error(`${label} references a missing game.`);
    if ([...runGameIds.values()].includes(gameId)) throw new Error(`${label} duplicates a GameRun for one game.`);
    runGameIds.set(id, gameId);
    dateString(item.startedAt, `${label}.startedAt`); dateString(item.completedAt, `${label}.completedAt`, true);
    dateString(item.secondChanceCalculatedAt, `${label}.secondChanceCalculatedAt`, true);
    ["secondChanceSourceWheelId", "secondChanceBeforeClaimId", "secondChanceBeforeDisplayName", "secondChanceAfterClaimId", "secondChanceAfterDisplayName"].forEach((field) => optionalString(item, field, label));
    optionalInteger(item, "secondChanceBeforeEntryIndex", label); optionalInteger(item, "secondChanceAfterEntryIndex", label);
  });
  rounds.forEach((item, index) => {
    const label = `rounds[${index}]`;
    exactKeys(item, ROUND_KEYS, label);
    const gameRunId = requiredString(item, "gameRunId", label);
    if (!runIds.has(gameRunId)) throw new Error(`${label} references a missing run.`);
    roundRunIds.set(String(item.id), gameRunId);
    requiredInteger(item, "position", label); optionalString(item, "title", label);
    enumValue(item.status, ["READY", "IN_PROGRESS", "COMPLETED"], `${label}.status`);
    dateString(item.startedAt, `${label}.startedAt`); dateString(item.completedAt, `${label}.completedAt`, true);
  });
  wheels.forEach((item, index) => {
    const label = `wheels[${index}]`;
    exactKeys(item, WHEEL_KEYS, label);
    const gameRoundId = requiredString(item, "gameRoundId", label);
    if (!roundIds.has(gameRoundId)) throw new Error(`${label} references a missing round.`);
    wheelRoundIds.set(String(item.id), gameRoundId);
    requiredInteger(item, "position", label); requiredString(item, "label", label);
    enumValue(item.type, ["NAME", "VALUE"], `${label}.type`);
    enumValue(item.status, ["READY", "SPINNING", "COMPLETED"], `${label}.status`);
    if (!Array.isArray(item.originalEntries) || !Array.isArray(item.shuffledEntries)) throw new Error(`${label} entries must be JSON arrays.`);
    optionalInteger(item, "spinDurationSeconds", label); optionalInteger(item, "winnerEntryIndex", label);
    optionalString(item, "winnerClaimId", label); optionalString(item, "winnerDisplayName", label); optionalString(item, "winnerValue", label);
    if (typeof item.winnerClaimId === "string" && !claimIds.has(item.winnerClaimId)) throw new Error(`${label} references a missing winning claim.`);
    ["shuffledAt", "spunAt", "completedAt", "resultAcceptedAt"].forEach((field) => dateString(item[field], `${label}.${field}`, true));
  });
  runs.forEach((item, index) => {
    const label = `runs[${index}]`;
    const runGameId = String(item.gameId);
    if (typeof item.secondChanceSourceWheelId === "string") {
      if (!wheelIds.has(item.secondChanceSourceWheelId)) throw new Error(`${label} references a missing Second Chance wheel.`);
      const sourceGameId = runGameIds.get(roundRunIds.get(wheelRoundIds.get(item.secondChanceSourceWheelId) ?? "") ?? "");
      if (sourceGameId !== runGameId) throw new Error(`${label} Second Chance wheel belongs to another game.`);
    }
    for (const field of ["secondChanceBeforeClaimId", "secondChanceAfterClaimId"]) {
      if (typeof item[field] === "string" && !claimIds.has(item[field] as string)) throw new Error(`${label} references a missing Second Chance claim.`);
      if (typeof item[field] === "string" && claimGameIds.get(item[field] as string) !== runGameId) throw new Error(`${label} Second Chance claim belongs to another game.`);
    }
  });
  prizeClaims.forEach((item, index) => {
    const label = `prizeClaims[${index}]`;
    exactKeys(item, PRIZE_KEYS, label);
    const gameId = requiredString(item, "gameId", label);
    const gameWheelId = requiredString(item, "gameWheelId", label);
    if (!gameIds.has(gameId)) throw new Error(`${label} references a missing game.`);
    if (!wheelIds.has(gameWheelId)) throw new Error(`${label} references a missing wheel.`);
    const wheelGameId = runGameIds.get(roundRunIds.get(wheelRoundIds.get(gameWheelId) ?? "") ?? "");
    if (wheelGameId !== gameId) throw new Error(`${label} wheel does not belong to its game.`);
    optionalString(item, "winnerClaimId", label);
    if (typeof item.winnerClaimId === "string" && !claimIds.has(item.winnerClaimId)) throw new Error(`${label} references a missing winning claim.`);
    if (typeof item.winnerClaimId === "string" && claimGameIds.get(item.winnerClaimId) !== gameId) throw new Error(`${label} winning claim does not belong to its game.`);
    requiredString(item, "winnerDisplayName", label); requiredString(item, "wheelLabel", label);
    enumValue(item.status, ["OPEN", "SUBMITTED", "REVIEWED", "FULFILLED", "EXPIRED", "REVOKED"], `${label}.status`);
    ["expiresAt", "generatedAt", "submittedAt", "reviewedAt", "fulfilledAt", "revokedAt"].forEach((field) => dateString(item[field], `${label}.${field}`, field !== "generatedAt"));
    ["preferredPrize", "selectedPrizeOptionId", "selectedPrizeOptionLabel", "recipientName", "addressLine1", "addressLine2", "city", "stateProvince", "postalCode", "country", "winnerNotes", "adminNotes"].forEach((field) => optionalString(item, field, label));
    for (const field of ["prizeOptions", "selectedPrizeOption", "selectedBalls"]) {
      const json = item[field];
      if (json !== null && typeof json === "undefined") throw new Error(`${label}.${field} must contain JSON or null.`);
    }
  });
  const roundPositions = new Set<string>();
  rounds.forEach((item) => {
    const key = `${String(item.gameRunId)}:${Number(item.position)}`;
    if (roundPositions.has(key)) throw new Error("Rounds contain a duplicate position within one run.");
    roundPositions.add(key);
  });
  const wheelPositions = new Set<string>();
  wheels.forEach((item) => {
    const key = `${String(item.gameRoundId)}:${Number(item.position)}`;
    if (wheelPositions.has(key)) throw new Error("Wheels contain a duplicate position within one round.");
    wheelPositions.add(key);
    const wheelGameId = runGameIds.get(roundRunIds.get(String(item.gameRoundId)) ?? "");
    if (typeof item.winnerClaimId === "string" && claimGameIds.get(item.winnerClaimId) !== wheelGameId) {
      throw new Error("A wheel winning claim does not belong to the wheel's game.");
    }
  });
  if (data.shopSettings !== null) {
    if (!isRecord(data.shopSettings)) throw new Error("data.shopSettings must be an object or null.");
    exactKeys(data.shopSettings, ["createdAt", "id", "paymentInstructions", "updatedAt"], "shopSettings");
    requiredString(data.shopSettings, "id", "shopSettings"); optionalString(data.shopSettings, "paymentInstructions", "shopSettings");
    dateString(data.shopSettings.createdAt, "shopSettings.createdAt"); dateString(data.shopSettings.updatedAt, "shopSettings.updatedAt");
  }
  if (version === LEGACY_BACKUP_VERSION) {
    const sequence = data.raffleSequence;
    if (sequence !== null) {
      if (!isRecord(sequence)) throw new Error("data.raffleSequence must be an object or null.");
      exactKeys(sequence, ["createdAt", "id", "nextValue", "updatedAt"], "raffleSequence");
      requiredString(sequence, "id", "raffleSequence"); requiredInteger(sequence, "nextValue", "raffleSequence");
      dateString(sequence.createdAt, "raffleSequence.createdAt"); dateString(sequence.updatedAt, "raffleSequence.updatedAt");
    }
  } else {
    const sequences = recordArray(data, "raffleSequences");
    validateRecordBasics(sequences, "raffleSequences");
    const years = new Set<number>();
    sequences.forEach((sequence, index) => {
      const label = `raffleSequences[${index}]`;
      exactKeys(sequence, ["createdAt", "id", "nextValue", "updatedAt", "year"], label);
      const year = requiredInteger(sequence, "year", label);
      const nextValue = requiredInteger(sequence, "nextValue", label);
      if (!isValidRaffleYear(year) || nextValue < 1 || nextValue > 1000000) throw new Error(`${label} is invalid.`);
      if (years.has(year)) throw new Error(`Duplicate raffle sequence year ${year}.`);
      years.add(year);
    });
  }
}

export function backupPreview(document: BackupDocument) {
  const data = document.data;
  return {
    exportedAt: document.exportedAt,
    games: data.games.length,
    claims: data.claims.length,
    runs: data.runs.length,
    rounds: data.rounds.length,
    wheels: data.wheels.length,
    templates: data.templates.length,
    prizeClaims: data.prizeClaims.length,
    raffleSequenceNextValue: data.raffleSequences.reduce((highest, sequence) => Math.max(highest, Number(sequence.nextValue)), 1),
    openPrizeLinksRevoked: data.prizeClaims.filter((claim) => claim.status === "OPEN").length,
  };
}

export function restoredRaffleSequences(games: Array<Record<string, JsonValue>>, sequences: Array<Record<string, JsonValue>>) {
  const nextByYear = new Map<number, number>();
  for (const game of games) {
    const year = Number(game.raffleYear);
    nextByYear.set(year, Math.max(nextByYear.get(year) ?? 1, Number(game.raffleNumber) + 1));
  }
  for (const sequence of sequences) {
    const year = Number(sequence.year);
    nextByYear.set(year, Math.max(nextByYear.get(year) ?? 1, Number(sequence.nextValue)));
  }
  return [...nextByYear.entries()].sort(([left], [right]) => left - right).map(([year, nextValue]) => ({ year, nextValue }));
}

function normalizeLegacyBackupData(data: Record<string, unknown>, exportedAt: string): BackupData {
  const legacy = data as Record<string, JsonValue>;
  const games = (legacy.games as Array<Record<string, JsonValue>>).map((game) => {
    const year = getCurrentRaffleYear(new Date(String(game.createdAt)));
    const number = Number(game.raffleNumber);
    return { ...game, raffleYear: year, raffleCode: formatRaffleCode({ year, number }) };
  });
  const legacySequence = isRecord(legacy.raffleSequence)
    ? legacy.raffleSequence as Record<string, JsonValue>
    : null;
  const exportedYear = getCurrentRaffleYear(new Date(exportedAt));
  const rebuilt = restoredRaffleSequences(games, legacySequence ? [{ ...legacySequence, year: exportedYear }] : []);
  const raffleSequences = rebuilt.map(({ year, nextValue }) => ({
    id: legacySequence && year === exportedYear
      ? String(legacySequence.id)
      : `${legacySequence ? String(legacySequence.id) : "restored_sequence"}_${year}`,
    year,
    nextValue,
    createdAt: legacySequence && year === exportedYear ? legacySequence.createdAt : exportedAt,
    updatedAt: legacySequence && year === exportedYear ? legacySequence.updatedAt : exportedAt,
  }));
  const remaining = Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== "raffleSequence"));
  return { ...remaining, games, raffleSequences } as unknown as BackupData;
}

export function restoredPrizeClaimStatus(status: string) {
  return status === "OPEN" ? "REVOKED" : status;
}
