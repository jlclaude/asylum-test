-- CreateTable
CREATE TABLE "HostUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'HOST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "passwordChangedAt" DATETIME,
    "passwordMustChange" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "HostSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    "ipHash" TEXT,
    CONSTRAINT "HostSession_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "HostPasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostPasswordResetToken_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "HostLoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifierHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "windowStartedAt" DATETIME NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "HostAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "HostUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HostUser_shop_email_key" ON "HostUser"("shop", "email");
CREATE INDEX "HostUser_shop_idx" ON "HostUser"("shop");
CREATE INDEX "HostUser_shop_role_isActive_idx" ON "HostUser"("shop", "role", "isActive");
CREATE UNIQUE INDEX "HostSession_tokenHash_key" ON "HostSession"("tokenHash");
CREATE INDEX "HostSession_hostUserId_idx" ON "HostSession"("hostUserId");
CREATE INDEX "HostSession_expiresAt_idx" ON "HostSession"("expiresAt");
CREATE UNIQUE INDEX "HostPasswordResetToken_tokenHash_key" ON "HostPasswordResetToken"("tokenHash");
CREATE INDEX "HostPasswordResetToken_hostUserId_idx" ON "HostPasswordResetToken"("hostUserId");
CREATE INDEX "HostPasswordResetToken_expiresAt_idx" ON "HostPasswordResetToken"("expiresAt");
CREATE UNIQUE INDEX "HostLoginAttempt_identifierHash_ipHash_windowStartedAt_key" ON "HostLoginAttempt"("identifierHash", "ipHash", "windowStartedAt");
CREATE INDEX "HostLoginAttempt_blockedUntil_idx" ON "HostLoginAttempt"("blockedUntil");
CREATE INDEX "HostAuditEvent_shop_createdAt_idx" ON "HostAuditEvent"("shop", "createdAt");
CREATE INDEX "HostAuditEvent_actorId_createdAt_idx" ON "HostAuditEvent"("actorId", "createdAt");
CREATE INDEX "HostAuditEvent_targetType_targetId_idx" ON "HostAuditEvent"("targetType", "targetId");
