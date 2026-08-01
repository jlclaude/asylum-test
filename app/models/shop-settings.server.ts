import db from "../db.server";
import { publicPaymentInstructionsPayload } from "../lib/payment-instructions";

export function getShopSettings(shop: string) {
  return db.shopSettings.findUnique({ where: { shop } });
}

export function getOrCreateShopSettings(shop: string) {
  return db.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export function updatePaymentInstructions(shop: string, value: string) {
  return db.shopSettings.upsert({
    where: { shop },
    update: { paymentInstructions: value || null },
    create: { shop, paymentInstructions: value || null },
  });
}

export async function getPublicPaymentInstructions(shop: string) {
  const settings = await db.shopSettings.findUnique({
    where: { shop },
    select: { paymentInstructions: true },
  });
  return publicPaymentInstructionsPayload(settings);
}
