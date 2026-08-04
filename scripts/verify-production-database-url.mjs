const value = process.env.DATABASE_URL?.trim() ?? "";

if (!value) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

if (!/^postgres(?:ql)?:\/\//i.test(value)) {
  throw new Error(
    "Production DATABASE_URL must be a PostgreSQL URL beginning with postgresql:// or postgres://.",
  );
}

console.info("Production DATABASE_URL uses PostgreSQL.");
