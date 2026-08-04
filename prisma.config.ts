import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/postgresql/schema.prisma",
  migrations: { path: "prisma/postgresql/migrations" },
});
