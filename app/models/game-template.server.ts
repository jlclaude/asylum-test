import {
  TEMPLATE_NAME_MAX_LENGTH,
  type GameTemplateInput,
} from "../lib/game-template-validation";
import db from "../db.server";

const templateData = (input: GameTemplateInput) => ({
  name: input.name,
  description: input.description ?? null,
  defaultGameTitle: input.defaultGameTitle ?? null,
  defaultGameDescription: input.defaultGameDescription ?? null,
  totalSpots: input.totalSpots,
  pricePerSpot: input.pricePerSpot,
  wheelCount: input.wheelCount,
  initialStatus: input.initialStatus,
  isDefault: input.isDefault,
});

export function getGameTemplatesForShop(shop: string, sort: "name" | "recent" = "name") {
  return db.gameTemplate.findMany({
    where: { shop },
    orderBy: sort === "recent"
      ? [{ isDefault: "desc" }, { updatedAt: "desc" }]
      : [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export function getGameTemplateForShop(id: string, shop: string) {
  return db.gameTemplate.findFirst({ where: { id, shop } });
}

export async function getGameTemplateSummaryForShop(shop: string) {
  const [count, defaultTemplate] = await Promise.all([
    db.gameTemplate.count({ where: { shop } }),
    db.gameTemplate.findFirst({
      where: { shop, isDefault: true },
      select: { id: true, name: true },
    }),
  ]);
  return { count, defaultTemplate };
}

export async function createGameTemplate(shop: string, input: GameTemplateInput) {
  if (!input.isDefault) {
    return db.gameTemplate.create({ data: { shop, ...templateData(input) } });
  }

  return db.$transaction(async (transaction) => {
    await transaction.gameTemplate.updateMany({
      where: { shop, isDefault: true },
      data: { isDefault: false },
    });
    return transaction.gameTemplate.create({ data: { shop, ...templateData(input) } });
  });
}

export async function updateGameTemplate(id: string, shop: string, input: GameTemplateInput) {
  return db.$transaction(async (transaction) => {
    const existing = await transaction.gameTemplate.findFirst({ where: { id, shop } });
    if (!existing) return null;
    if (input.isDefault) {
      await transaction.gameTemplate.updateMany({
        where: { shop, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return transaction.gameTemplate.update({
      where: { id },
      data: templateData(input),
    });
  });
}

export async function duplicateGameTemplate(id: string, shop: string) {
  const source = await getGameTemplateForShop(id, shop);
  if (!source) return null;

  let suffix = 1;
  const duplicateName = () => {
    const suffixLabel = suffix === 1 ? " Copy" : ` Copy ${suffix}`;
    return `${source.name.slice(0, TEMPLATE_NAME_MAX_LENGTH - suffixLabel.length)}${suffixLabel}`;
  };
  let name = duplicateName();
  while (await db.gameTemplate.findUnique({ where: { shop_name: { shop, name } }, select: { id: true } })) {
    suffix += 1;
    name = duplicateName();
  }

  return db.gameTemplate.create({
    data: {
      shop,
      name,
      description: source.description,
      defaultGameTitle: source.defaultGameTitle,
      defaultGameDescription: source.defaultGameDescription,
      totalSpots: source.totalSpots,
      pricePerSpot: source.pricePerSpot,
      wheelCount: source.wheelCount,
      initialStatus: source.initialStatus,
      isDefault: false,
    },
  });
}

export function deleteGameTemplate(id: string, shop: string) {
  return db.gameTemplate.deleteMany({ where: { id, shop } });
}
