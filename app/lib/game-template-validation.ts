import type { GameStatus } from "@prisma/client";

export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;
export const GAME_TITLE_MAX_LENGTH = 150;
export const GAME_DESCRIPTION_MAX_LENGTH = 2000;
export const TOTAL_SPOTS_MAX = 100_000;
export const PRICE_PER_SPOT_MAX = 1_000_000;
export const WHEEL_COUNT_MIN = 1;
export const WHEEL_COUNT_MAX = 20;

export type GameTemplateFormValues = {
  name: string;
  description: string;
  defaultGameTitle: string;
  defaultGameDescription: string;
  totalSpots: string;
  pricePerSpot: string;
  wheelCount: string;
  initialStatus: string;
  isDefault: boolean;
};

export type GameTemplateInput = {
  name: string;
  description?: string;
  defaultGameTitle?: string;
  defaultGameDescription?: string;
  totalSpots: number;
  pricePerSpot: string;
  wheelCount: number;
  initialStatus: Extract<GameStatus, "OPEN" | "CLOSED">;
  isDefault: boolean;
};

export type GameTemplateErrors = Partial<Record<
  "name" | "description" | "defaultGameTitle" | "defaultGameDescription" |
  "totalSpots" | "pricePerSpot" | "wheelCount" | "initialStatus" | "form",
  string
>>;

type GameSetup = {
  title: string;
  description: string | null;
  totalSpots: number;
  pricePerSpot: { toString(): string };
  wheelCount: number;
};

export function gameSetupTemplateInput(name: string, game: GameSetup): GameTemplateInput {
  return {
    name: name.trim(),
    defaultGameTitle: game.title,
    defaultGameDescription: game.description ?? undefined,
    totalSpots: game.totalSpots,
    pricePerSpot: game.pricePerSpot.toString(),
    wheelCount: game.wheelCount,
    initialStatus: "OPEN",
    isDefault: false,
  };
}

export function gameTemplateValues(formData: FormData): GameTemplateFormValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    defaultGameTitle: String(formData.get("defaultGameTitle") ?? "").trim(),
    defaultGameDescription: String(formData.get("defaultGameDescription") ?? "").trim(),
    totalSpots: String(formData.get("totalSpots") ?? ""),
    pricePerSpot: String(formData.get("pricePerSpot") ?? ""),
    wheelCount: String(formData.get("wheelCount") ?? "2"),
    initialStatus: String(formData.get("initialStatus") ?? "OPEN"),
    isDefault: formData.get("isDefault") === "true",
  };
}

export function validateGameTemplate(values: GameTemplateFormValues): {
  errors: GameTemplateErrors;
  input?: GameTemplateInput;
} {
  const errors: GameTemplateErrors = {};
  const totalSpots = Number(values.totalSpots);
  const pricePerSpot = Number(values.pricePerSpot);
  const wheelCount = Number(values.wheelCount);

  if (!values.name) errors.name = "Enter a template name.";
  else if (values.name.length > TEMPLATE_NAME_MAX_LENGTH) {
    errors.name = `Template names must be ${TEMPLATE_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (values.description.length > TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Template descriptions must be ${TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  if (values.defaultGameTitle.length > GAME_TITLE_MAX_LENGTH) {
    errors.defaultGameTitle = `Default game titles must be ${GAME_TITLE_MAX_LENGTH} characters or fewer.`;
  }
  if (values.defaultGameDescription.length > GAME_DESCRIPTION_MAX_LENGTH) {
    errors.defaultGameDescription = `Default game descriptions must be ${GAME_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  if (!Number.isInteger(totalSpots) || totalSpots < 1 || totalSpots > TOTAL_SPOTS_MAX) {
    errors.totalSpots = "Total spots must be a whole number between 1 and 100,000.";
  }
  if (!Number.isFinite(pricePerSpot) || pricePerSpot < 0 || pricePerSpot > PRICE_PER_SPOT_MAX) {
    errors.pricePerSpot = "Enter a valid price between 0 and 1,000,000.";
  }
  if (!Number.isInteger(wheelCount) || wheelCount < WHEEL_COUNT_MIN || wheelCount > WHEEL_COUNT_MAX) {
    errors.wheelCount = "The number of name wheels must be between 1 and 20.";
  }
  if (values.initialStatus !== "OPEN" && values.initialStatus !== "CLOSED") {
    errors.initialStatus = "Select a valid initial status.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    input: {
      name: values.name,
      description: values.description || undefined,
      defaultGameTitle: values.defaultGameTitle || undefined,
      defaultGameDescription: values.defaultGameDescription || undefined,
      totalSpots,
      pricePerSpot: pricePerSpot.toFixed(2),
      wheelCount,
      initialStatus: values.initialStatus as "OPEN" | "CLOSED",
      isDefault: values.isDefault,
    },
  };
}
