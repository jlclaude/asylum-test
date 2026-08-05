import db from "../db.server";

type AuditInput = {
  shop: string;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export function recordHostAuditEvent(input: AuditInput) {
  return db.hostAuditEvent.create({
    data: {
      shop: input.shop,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export function listHostAuditEvents(shop: string, take = 100) {
  return db.hostAuditEvent.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 250),
  });
}
