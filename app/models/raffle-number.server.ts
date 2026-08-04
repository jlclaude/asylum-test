import type { Prisma } from "@prisma/client";
import { formatRaffleCode, getCurrentRaffleYear } from "../lib/raffle-number.ts";

export async function allocateNextRaffleIdentity(input: {
  tx: Prisma.TransactionClient;
  shop: string;
  now?: Date;
}) {
  const raffleYear = getCurrentRaffleYear(input.now);
  const sequence = await input.tx.shopRaffleSequence.upsert({
    where: { shop_year: { shop: input.shop, year: raffleYear } },
    create: { shop: input.shop, year: raffleYear, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const raffleNumber = sequence.nextValue - 1;
  if (raffleNumber > 999999) throw new Error(`This shop has exhausted its ${raffleYear} raffle-number range.`);
  return {
    raffleYear,
    raffleNumber,
    raffleCode: formatRaffleCode({ year: raffleYear, number: raffleNumber }),
  };
}
