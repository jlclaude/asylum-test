import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

import { assertProductionDatabaseUrl } from "../app/lib/database-url.server.ts";
import { canonicalJson } from "../app/lib/backup-format.ts";
import { retrySerializableTransaction } from "../app/lib/prisma-transaction.server.ts";

test("production requires a PostgreSQL DATABASE_URL without exposing it", () => {
  assert.throws(
    () => assertProductionDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: undefined }),
    /Missing required environment variable: DATABASE_URL/,
  );
  assert.throws(
    () => assertProductionDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "file:production.sqlite" }),
    /must use PostgreSQL/,
  );
  assert.doesNotThrow(() => assertProductionDatabaseUrl({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://private:secret@example.invalid/asylum",
  }));
  assert.doesNotThrow(() => assertProductionDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: undefined }));
});

test("provider-neutral backup serialization preserves BigInt, Decimal text, and dates", () => {
  const date = "2026-08-04T12:00:00.000Z";
  assert.equal(canonicalJson({ userId: 42n, price: "12.50", createdAt: date }),
    `{"createdAt":"${date}","price":"12.50","userId":"42"}`);
});

test("production Prisma defaults to PostgreSQL and deploy never resets data", () => {
  const config = readFileSync("prisma.config.ts", "utf8");
  const schema = readFileSync("prisma/postgresql/schema.prisma", "utf8");
  const baseline = readFileSync("prisma/postgresql/migrations/20260804000000_baseline/migration.sql", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
  assert.match(config, /prisma\/postgresql\/schema\.prisma/);
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
  assert.doesNotMatch(baseline, /PRAGMA|randomblob|strftime|file:/i);
  assert.match(baseline, /Game_shop_raffleYear_raffleNumber_key/);
  assert.match(baseline, /ShopRaffleSequence_shop_year_key/);
  assert.match(scripts["db:production:migrate:deploy"], /migrate deploy/);
  assert.doesNotMatch(scripts["db:production:migrate:deploy"], /migrate dev|reset|db push/);
});

test("serializable transaction conflicts retry without swallowing other errors", async () => {
  let attempts = 0;
  const value = await retrySerializableTransaction(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: Prisma.prismaVersion.client,
      });
    }
    return "saved";
  });
  assert.equal(value, "saved");
  assert.equal(attempts, 3);
  await assert.rejects(() => retrySerializableTransaction(async () => {
    throw new Error("not retryable");
  }), /not retryable/);
});
