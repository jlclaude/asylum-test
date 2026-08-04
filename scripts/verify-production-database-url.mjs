const value = process.env.DATABASE_URL?.trim() ?? "";

if (!/^postgres(?:ql)?:\/\//i.test(value)) {
  throw new Error(
    "Production DATABASE_URL must be a PostgreSQL URL beginning with postgresql:// or postgres://.",
  );
}

console.info("Production DATABASE_URL uses PostgreSQL.");
