CREATE TYPE "HostRole" AS ENUM ('OWNER', 'HOST', 'MODERATOR', 'VIEWER');

CREATE TABLE "HostUser" (
    "id" TEXT NOT NULL, "shop" TEXT NOT NULL, "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
    "role" "HostRole" NOT NULL DEFAULT 'HOST', "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3), "passwordMustChange" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "HostUser_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HostSession" (
    "id" TEXT NOT NULL, "hostUserId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT, "ipHash" TEXT, CONSTRAINT "HostSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HostPasswordResetToken" (
    "id" TEXT NOT NULL, "hostUserId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostPasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HostLoginAttempt" (
    "id" TEXT NOT NULL, "identifierHash" TEXT NOT NULL, "ipHash" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL, "failedCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "HostLoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HostAuditEvent" (
    "id" TEXT NOT NULL, "shop" TEXT NOT NULL, "actorId" TEXT, "actorLabel" TEXT,
    "action" TEXT NOT NULL, "targetType" TEXT, "targetId" TEXT, "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostAuditEvent_pkey" PRIMARY KEY ("id")
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

ALTER TABLE "HostSession" ADD CONSTRAINT "HostSession_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostPasswordResetToken" ADD CONSTRAINT "HostPasswordResetToken_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostAuditEvent" ADD CONSTRAINT "HostAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "HostUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
