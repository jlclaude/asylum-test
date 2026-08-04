import type { ClaimStatus, GameStatus } from "@prisma/client";
import {
  GAME_TITLE_MAX_LENGTH,
  PRICE_PER_SPOT_MAX,
  TOTAL_SPOTS_MAX,
  WHEEL_COUNT_MAX,
  WHEEL_COUNT_MIN,
} from "./game-template-validation.ts";

export const TEST_GAME_TITLE = "[TEST] Development Test Raffle";
export const TEST_GAME_DESCRIPTION_MARKER = "[ASYLUM DEVELOPMENT TEST DATA v1]";
export const TEST_GAME_DELETE_CONFIRMATION = "DELETE TEST GAME";

export type TestGamePaymentMode = "ALL_PAID" | "MIXED" | "PENDING";
export type TestGameInitialState = "OPEN" | "CLOSED" | "INITIALIZED";

export type TestClaimDefinition = {
  displayName: string;
  quantity: number;
  status: ClaimStatus;
  externalPayment: boolean;
};

export type TestGameOptions = {
  title: string;
  totalSpots: number;
  pricePerSpot: string;
  wheelCount: number;
  claimCount: number;
  paymentMode: TestGamePaymentMode;
  initialState: TestGameInitialState;
  includeDuplicateNames: boolean;
};

const NAMES = [
  "Alex Smith", "jamie O'Neil", "Morgan Lee", "Chris & Sam", "TAYLOR reed",
  "Jordan King", "Alex Smith", "Pat D'Arcy", "Riley-Jane Cole", "morgan lee",
  "Casey Stone", "Drew McKay", "Sam Rivera", "Jo A. Brooks", "Taylor Reed",
  "Quinn North", "Chris & Sam", "Avery Lane", "Robin West", "Jamie O'Neil",
  "Devon Price", "Sky Monroe", "Casey Stone", "Lee Chen", "Riley-Jane Cole",
] as const;

const QUANTITIES = [5, 2, 4, 7, 1, 3, 6, 2, 8, 1, 4, 3, 5, 2, 6, 1, 3, 4, 2, 5, 1, 3, 2, 4, 1] as const;

export function testGameToolsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && env.ENABLE_TEST_GAME_TOOLS === "true";
}

export function isDevelopmentTestGame(game: { title: string; description: string | null }) {
  return game.title.startsWith("[TEST]") &&
    game.description?.includes(TEST_GAME_DESCRIPTION_MARKER) === true;
}

export function parseTestGameOptions(formData: FormData) {
  const rawTitle = String(formData.get("title") ?? "").trim();
  const title = rawTitle.replace(/^\[TEST\]\s*/i, "");
  const totalSpots = Number(formData.get("totalSpots") ?? 100);
  const pricePerSpot = String(formData.get("pricePerSpot") ?? "10.00").trim();
  const wheelCount = Number(formData.get("wheelCount") ?? 2);
  const claimCount = Number(formData.get("claimCount") ?? 20);
  const paymentMode = String(formData.get("paymentMode") ?? "ALL_PAID");
  const initialState = String(formData.get("initialState") ?? "CLOSED");
  if (!title) throw new Error("Test title is required.");
  if (title.length + "[TEST] ".length > GAME_TITLE_MAX_LENGTH) {
    throw new Error(`Test title must be ${GAME_TITLE_MAX_LENGTH - "[TEST] ".length} characters or fewer.`);
  }
  if (!Number.isInteger(totalSpots) || totalSpots < 1 || totalSpots > TOTAL_SPOTS_MAX) {
    throw new Error(`Total spots must be a whole number from 1 through ${TOTAL_SPOTS_MAX.toLocaleString()}.`);
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(pricePerSpot) || Number(pricePerSpot) < 0 || Number(pricePerSpot) > PRICE_PER_SPOT_MAX) {
    throw new Error(`Price per spot must be from 0 through ${PRICE_PER_SPOT_MAX.toLocaleString()} with no more than two decimal places.`);
  }
  if (!Number.isInteger(wheelCount) || wheelCount < WHEEL_COUNT_MIN || wheelCount > WHEEL_COUNT_MAX) {
    throw new Error(`Containment count must be ${WHEEL_COUNT_MIN} through ${WHEEL_COUNT_MAX}.`);
  }
  if (!Number.isInteger(claimCount) || claimCount < 15 || claimCount > 25) {
    throw new Error("Claim count must be a whole number from 15 through 25.");
  }
  if (!(["ALL_PAID", "MIXED", "PENDING"] as string[]).includes(paymentMode)) {
    throw new Error("Select a valid payment mode.");
  }
  if (!(["OPEN", "CLOSED", "INITIALIZED"] as string[]).includes(initialState)) {
    throw new Error("Select a valid initial game state.");
  }
  return {
    title,
    totalSpots,
    pricePerSpot,
    wheelCount,
    claimCount,
    paymentMode: paymentMode as TestGamePaymentMode,
    initialState: initialState as TestGameInitialState,
    includeDuplicateNames: formData.get("includeDuplicateNames") === "true",
  };
}

export function buildDeterministicTestClaims(
  count: number,
  paymentMode: TestGamePaymentMode,
  includeDuplicateNames = true,
): TestClaimDefinition[] {
  if (!Number.isInteger(count) || count < 15 || count > 25) {
    throw new Error("Claim count must be a whole number from 15 through 25.");
  }
  return NAMES.slice(0, count).map((sourceName, index) => {
    const displayName = includeDuplicateNames ? sourceName : `${sourceName} ${index + 1}`;
    if (paymentMode === "ALL_PAID") {
      return { displayName, quantity: QUANTITIES[index], status: "CONFIRMED", externalPayment: true };
    }
    if (paymentMode === "PENDING") {
      return { displayName, quantity: QUANTITIES[index], status: "PENDING", externalPayment: false };
    }
    const variants: Array<Pick<TestClaimDefinition, "status" | "externalPayment">> = [
      { status: "CONFIRMED", externalPayment: true },
      { status: "PENDING", externalPayment: false },
      { status: "CONFIRMED", externalPayment: false },
      { status: "CANCELED", externalPayment: false },
    ];
    return { displayName, quantity: QUANTITIES[index], ...variants[index % variants.length] };
  });
}

export function persistedGameStatusFor(state: TestGameInitialState): GameStatus {
  return state === "OPEN" ? "OPEN" : "CLOSED";
}
