export const PRIZE_BALL_TYPES = ["DOMESTIC", "OVERSEAS", "CUSTOM"] as const;
export type PrizeBallType = typeof PRIZE_BALL_TYPES[number];

export type PrizePackageOption = {
  id: string;
  label: string;
  ballType: PrizeBallType;
  ballCount: number;
  position: number;
  collectionId?: string;
  collectionTitle?: string;
  collectionHandle?: string | null;
};

export type LegacyPrizeBallSelection = { position: number; name: string; productUrl: string | null };
export type ProductPrizeBallSelection = {
  position: number;
  productId: string;
  productTitle: string;
  productHandle: string;
  productImageUrl: string | null;
  productImageAlt: string | null;
  collectionId: string;
  collectionTitle: string;
  weightPounds: number | null;
};
export type PrizeBallSelection = LegacyPrizeBallSelection | ProductPrizeBallSelection;
export const DOMESTIC_WEIGHTS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

const MAX_OPTIONS = 20;
const MAX_BALLS = 10;
const MAX_LABEL = 200;

function cleanLine(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePrizePackageOptions(value: string | null | undefined): PrizePackageOption[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_OPTIONS) return null;
    const options = parsed.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error("Invalid prize option.");
      const record = item as Record<string, unknown>;
      const id = cleanLine(record.id);
      const label = cleanLine(record.label);
      const ballType = record.ballType;
      const ballCount = record.ballCount;
      if (!id || !label || label.length > MAX_LABEL ||
          !PRIZE_BALL_TYPES.includes(ballType as PrizeBallType) ||
          !Number.isInteger(ballCount) || Number(ballCount) < 1 || Number(ballCount) > MAX_BALLS) {
        throw new Error("Invalid prize option.");
      }
      const collectionId = cleanLine(record.collectionId);
      const collectionTitle = cleanLine(record.collectionTitle);
      const collectionHandle = cleanLine(record.collectionHandle) || null;
      return {
        id, label, ballType: ballType as PrizeBallType, ballCount: Number(ballCount), position: index + 1,
        ...(collectionId && collectionTitle ? { collectionId, collectionTitle, collectionHandle } : {}),
      };
    });
    if (new Set(options.map((option) => option.id)).size !== options.length) return null;
    return options;
  } catch {
    return null;
  }
}

export function validateAdminPrizePackageOptions(raw: FormDataEntryValue | null):
  | { options: PrizePackageOption[]; json: string; error?: never }
  | { error: string; options?: never; json?: never } {
  if (typeof raw !== "string") return { error: "Add at least one prize option." };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { error: "Prize options could not be read." }; }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "Add at least one prize option." };
  if (parsed.length > MAX_OPTIONS) return { error: `A maximum of ${MAX_OPTIONS} prize options is allowed.` };
  const options: PrizePackageOption[] = [];
  for (const [position, item] of parsed.entries()) {
    if (!item || typeof item !== "object") return { error: `Prize option ${position + 1} is invalid.` };
    const record = item as Record<string, unknown>;
    const label = cleanLine(record.label);
    const ballCount = Number(record.ballCount);
    const ballType = record.ballType;
    const collectionId = cleanLine(record.collectionId);
    const collectionTitle = cleanLine(record.collectionTitle);
    const collectionHandle = cleanLine(record.collectionHandle) || null;
    if (!label) return { error: `Prize option ${position + 1} needs a label.` };
    if (label.length > MAX_LABEL) return { error: `Prize option labels must be ${MAX_LABEL} characters or fewer.` };
    if (!PRIZE_BALL_TYPES.includes(ballType as PrizeBallType)) return { error: `Prize option ${position + 1} has an invalid ball type.` };
    if (!Number.isInteger(ballCount) || ballCount < 1 || ballCount > MAX_BALLS) return { error: `Prize option ${position + 1} must contain between 1 and ${MAX_BALLS} balls.` };
    if (!collectionId.startsWith("gid://shopify/Collection/") || !collectionTitle) return { error: `Prize option ${position + 1} needs a Shopify collection.` };
    options.push({ id: `option-${position + 1}`, label, ballType: ballType as PrizeBallType, ballCount, position: position + 1, collectionId, collectionTitle, collectionHandle });
  }
  return { options, json: JSON.stringify(options) };
}

function validHttpsUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateStructuredPrizeSelection(formData: FormData, options: PrizePackageOption[]):
  | { option: PrizePackageOption; balls: PrizeBallSelection[]; error?: never }
  | { error: string; option?: never; balls?: never } {
  const selectedIds = formData.getAll("selectedPrizeOptionId");
  if (selectedIds.length !== 1) return { error: "Select exactly one prize option." };
  const selectedId = cleanLine(selectedIds[0]);
  const option = options.find((candidate) => candidate.id === selectedId);
  if (!option) return { error: "Select one of the available prize options." };
  const ballNames = formData.getAll("ballName");
  const ballUrls = formData.getAll("ballUrl");
  if (ballNames.length !== option.ballCount || ballUrls.length !== option.ballCount) {
    return { error: `The selected package requires exactly ${option.ballCount} ball ${option.ballCount === 1 ? "selection" : "selections"}.` };
  }
  const balls: PrizeBallSelection[] = [];
  for (let index = 0; index < option.ballCount; index += 1) {
    const name = cleanLine(ballNames[index]);
    const url = cleanLine(ballUrls[index]);
    if (!name) return { error: `Ball ${index + 1} name is required.` };
    if (name.length > MAX_LABEL) return { error: `Ball names must be ${MAX_LABEL} characters or fewer.` };
    if (url && (url.length > 2000 || !validHttpsUrl(url))) return { error: `Ball ${index + 1} URL must be a valid HTTPS address.` };
    balls.push({ position: index + 1, name, productUrl: url || null });
  }
  return { option, balls };
}

export function parseSelectedBalls(value: string | null | undefined): PrizeBallSelection[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PrizeBallSelection => Boolean(item && typeof item === "object" && (typeof (item as LegacyPrizeBallSelection).name === "string" || typeof (item as ProductPrizeBallSelection).productTitle === "string")));
  } catch { return []; }
}

export function isCollectionPrizeOption(option: PrizePackageOption) {
  return Boolean(option.collectionId && option.collectionTitle);
}

export function isProductPrizeBall(ball: PrizeBallSelection): ball is ProductPrizeBallSelection {
  return "productId" in ball;
}

export function parseSelectedPrizeOption(value: string | null | undefined): PrizePackageOption | null {
  if (!value) return null;
  const parsed = parsePrizePackageOptions(`[${value}]`);
  return parsed?.[0] ?? null;
}
