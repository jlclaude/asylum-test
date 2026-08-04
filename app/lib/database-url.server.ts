export function assertProductionDatabaseUrl(
  environment: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "DATABASE_URL">> = process.env,
) {
  if (environment.NODE_ENV !== "production") return;
  const value = environment.DATABASE_URL?.trim() ?? "";
  if (!value) throw new Error("Missing required environment variable: DATABASE_URL");
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error("Production DATABASE_URL must use PostgreSQL.");
  }
}
