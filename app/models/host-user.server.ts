import type { HostRole } from "@prisma/client";
import db from "../db.server";
import {
  hashHostSecret,
  normalizeHostEmail,
  randomHostToken,
} from "../lib/host-auth.server";
import {
  hashHostPassword,
  validateHostPassword,
  verifyHostPassword,
} from "../lib/host-password.server";
import { recordHostAuditEvent } from "./host-audit.server";

export function listHostUsers(shop: string) {
  return db.hostUser.findMany({
    where: { shop },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      passwordMustChange: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });
}

export async function createHostUser(input: {
  shop: string;
  email: string;
  displayName: string;
  password: string;
  role: HostRole;
  actorId?: string;
  bootstrap?: boolean;
}) {
  const email = normalizeHostEmail(input.email);
  const displayName = input.displayName.trim();
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Enter a valid email address.");
  if (!displayName || displayName.length > 100)
    throw new Error("Enter a display name up to 100 characters.");
  const passwordError = validateHostPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  if (input.bootstrap) {
    const owners = await db.hostUser.count({
      where: { shop: input.shop, role: "OWNER", isActive: true },
    });
    if (owners)
      throw new Error(
        "An active Host Portal owner already exists for this shop.",
      );
  }
  try {
    const user = await db.hostUser.create({
      data: {
        shop: input.shop,
        email,
        displayName,
        role: input.role,
        passwordHash: await hashHostPassword(input.password),
        passwordMustChange: !input.bootstrap,
      },
    });
    await recordHostAuditEvent({
      shop: input.shop,
      actorId: input.actorId,
      action: input.bootstrap ? "host.owner_bootstrapped" : "host.created",
      targetType: "HostUser",
      targetId: user.id,
      metadata: { role: input.role },
    });
    return user;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint"))
      throw new Error("A host with this email already exists.");
    throw error;
  }
}

export async function authenticateHostPassword(
  shop: string,
  emailValue: string,
  password: string,
  onVerificationStart?: (accountFound: boolean) => void,
) {
  const email = normalizeHostEmail(emailValue);
  const user = await db.hostUser.findUnique({
    where: { shop_email: { shop, email } },
  });
  onVerificationStart?.(Boolean(user));
  const valid = user
    ? await verifyHostPassword(user.passwordHash, password)
    : await verifyHostPassword(
        await hashHostPassword("invalid-login-placeholder"),
        password,
      );
  if (
    !user ||
    !valid ||
    !user.isActive ||
    (user.lockedUntil && user.lockedUntil > new Date())
  )
    return null;
  await db.hostUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return user;
}

export async function recordFailedHostLogin(shop: string, emailValue: string) {
  const email = normalizeHostEmail(emailValue);
  const user = await db.hostUser.findUnique({
    where: { shop_email: { shop, email } },
  });
  if (!user) return;
  const failed = user.failedLoginCount + 1;
  await db.hostUser.update({
    where: { id: user.id },
    data: {
      failedLoginCount: failed,
      lockedUntil: failed >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null,
    },
  });
}

export async function loginAttemptBlocked(
  identifierHash: string,
  ipHash: string,
) {
  return Boolean(
    await db.hostLoginAttempt.findFirst({
      where: { identifierHash, ipHash, blockedUntil: { gt: new Date() } },
    }),
  );
}

export async function recordLoginAttemptFailure(
  identifierHash: string,
  ipHash: string,
) {
  const windowStartedAt = new Date(Math.floor(Date.now() / 900_000) * 900_000);
  const row = await db.hostLoginAttempt.upsert({
    where: {
      identifierHash_ipHash_windowStartedAt: {
        identifierHash,
        ipHash,
        windowStartedAt,
      },
    },
    create: { identifierHash, ipHash, windowStartedAt, failedCount: 1 },
    update: { failedCount: { increment: 1 } },
  });
  if (row.failedCount + 1 >= 12)
    await db.hostLoginAttempt.update({
      where: { id: row.id },
      data: { blockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });
}

async function activeOwnerCount(shop: string, excludeId?: string) {
  return db.hostUser.count({
    where: {
      shop,
      role: "OWNER",
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export async function updateHostUser(input: {
  shop: string;
  id: string;
  actorId: string;
  role?: HostRole;
  isActive?: boolean;
}) {
  const user = await db.hostUser.findFirst({
    where: { id: input.id, shop: input.shop },
  });
  if (!user) throw new Error("Host account not found.");
  if (
    user.role === "OWNER" &&
    user.isActive &&
    ((input.role && input.role !== "OWNER") || input.isActive === false) &&
    (await activeOwnerCount(input.shop, user.id)) === 0
  )
    throw new Error("The last active OWNER cannot be deactivated or demoted.");
  const updated = await db.hostUser.update({
    where: { id: user.id },
    data: { role: input.role, isActive: input.isActive },
  });
  if (input.isActive === false)
    await db.hostSession.updateMany({
      where: { hostUserId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  await recordHostAuditEvent({
    shop: input.shop,
    actorId: input.actorId,
    action: "host.updated",
    targetType: "HostUser",
    targetId: user.id,
    metadata: { role: updated.role, active: updated.isActive },
  });
  return updated;
}

export async function deleteHostUser(input: {
  shop: string;
  id: string;
  actorId: string;
}) {
  const user = await db.hostUser.findFirst({
    where: { id: input.id, shop: input.shop },
  });
  if (!user) throw new Error("Host account not found.");
  if (
    user.role === "OWNER" &&
    user.isActive &&
    (await activeOwnerCount(input.shop, user.id)) === 0
  )
    throw new Error("The last active OWNER cannot be deleted.");
  await recordHostAuditEvent({
    shop: input.shop,
    actorId: input.actorId,
    action: "host.deleted",
    targetType: "HostUser",
    targetId: user.id,
    metadata: { role: user.role },
  });
  await db.hostUser.delete({ where: { id: user.id } });
}

export async function createHostPasswordReset(input: {
  shop: string;
  id: string;
  actorId: string;
}) {
  const user = await db.hostUser.findFirst({
    where: { id: input.id, shop: input.shop },
  });
  if (!user) throw new Error("Host account not found.");
  const token = randomHostToken();
  await db.hostPasswordResetToken.create({
    data: {
      hostUserId: user.id,
      tokenHash: hashHostSecret(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  await recordHostAuditEvent({
    shop: input.shop,
    actorId: input.actorId,
    action: "host.password_reset_created",
    targetType: "HostUser",
    targetId: user.id,
  });
  return token;
}

export async function resetHostPassword(token: string, password: string) {
  const error = validateHostPassword(password);
  if (error) throw new Error(error);
  const row = await db.hostPasswordResetToken.findUnique({
    where: { tokenHash: hashHostSecret(token) },
    include: { hostUser: true },
  });
  if (
    !row ||
    row.usedAt ||
    row.expiresAt <= new Date() ||
    !row.hostUser.isActive
  )
    throw new Error("This reset link is invalid or expired.");
  await db.$transaction([
    db.hostPasswordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    db.hostUser.update({
      where: { id: row.hostUserId },
      data: {
        passwordHash: await hashHostPassword(password),
        passwordChangedAt: new Date(),
        passwordMustChange: false,
      },
    }),
    db.hostSession.updateMany({
      where: { hostUserId: row.hostUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await recordHostAuditEvent({
    shop: row.hostUser.shop,
    actorId: row.hostUserId,
    action: "host.password_reset_completed",
    targetType: "HostUser",
    targetId: row.hostUserId,
  });
}
