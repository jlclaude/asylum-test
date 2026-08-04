import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";

import { formatRaffleCode, getCurrentRaffleYear, parseRaffleSearch } from "../app/lib/raffle-number.ts";
import { allocateNextRaffleIdentity } from "../app/models/raffle-number.server.ts";

function sequenceTransaction() {
  const counters = new Map<string, number>();
  const tx = {
    shopRaffleSequence: {
      async upsert(args: {
        where: { shop_year: { shop: string; year: number } };
        create: { nextValue: number };
      }) {
        const { shop, year } = args.where.shop_year;
        const key = `${shop}:${year}`;
        const nextValue = counters.has(key) ? (counters.get(key) ?? 1) + 1 : args.create.nextValue;
        counters.set(key, nextValue);
        return { nextValue };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, counters };
}

test("UTC raffle year is injectable across the New Year boundary", () => {
  assert.equal(getCurrentRaffleYear(new Date("2026-12-31T23:59:59.999Z")), 2026);
  assert.equal(getCurrentRaffleYear(new Date("2027-01-01T00:00:00.000Z")), 2027);
});

test("formatting and parsing retain structured year and six-digit sequence", () => {
  assert.equal(formatRaffleCode({ year: 2026, number: 1 }), "ASY-2026-000001");
  assert.equal(formatRaffleCode({ year: 2026, number: 347 }), "ASY-2026-000347");
  assert.deepEqual(parseRaffleSearch("ASY-2026-000347"), { year: 2026, number: 347 });
  assert.deepEqual(parseRaffleSearch("2026-000347"), { year: 2026, number: 347 });
  assert.deepEqual(parseRaffleSearch("000347"), { year: null, number: 347 });
  assert.throws(() => formatRaffleCode({ year: 26, number: 1 }), /four-digit/);
  assert.throws(() => formatRaffleCode({ year: 2026, number: 1_000_000 }), /999999/);
});

test("allocation is independent per shop and UTC year", async () => {
  const { tx } = sequenceTransaction();
  const allocate = (shop: string, date: string) => allocateNextRaffleIdentity({ tx, shop, now: new Date(date) });
  assert.deepEqual(await allocate("a.myshopify.com", "2026-01-01T00:00:00Z"), {
    raffleYear: 2026, raffleNumber: 1, raffleCode: "ASY-2026-000001",
  });
  assert.equal((await allocate("a.myshopify.com", "2026-12-31T23:59:59Z")).raffleNumber, 2);
  assert.equal((await allocate("a.myshopify.com", "2027-01-01T00:00:00Z")).raffleNumber, 1);
  assert.equal((await allocate("b.myshopify.com", "2026-06-01T00:00:00Z")).raffleNumber, 1);
});
