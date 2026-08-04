import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const localPath = resolve("prisma/schema.prisma");
const productionPath = resolve("prisma/postgresql/schema.prisma");

function modelDefinitions(path) {
  const schema = readFileSync(path, "utf8");
  const start = schema.indexOf("model Session");
  if (start < 0) throw new Error(`No model definitions found in ${path}.`);
  return schema.slice(start).trim().replace(/\r\n/g, "\n");
}

if (modelDefinitions(localPath) !== modelDefinitions(productionPath)) {
  throw new Error(
    "SQLite and PostgreSQL Prisma model definitions differ. Keep both schemas in exact parity before generating or deploying.",
  );
}

console.info("SQLite and PostgreSQL Prisma schemas have matching models and enums.");
