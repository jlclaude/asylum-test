import type { HostRole } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { requireHostUser } from "./host-auth.server";

export type OperatorContext = {
  shop: string;
  source: "SHOPIFY_ADMIN" | "HOST_PORTAL";
  actorId: string;
  actorDisplayName: string;
  role: HostRole | "SHOPIFY_ADMIN";
};

type ShopifySessionIdentity = { shop: string; id: string };
type HostIdentity = {
  shop: string;
  actorId: string;
  actorDisplayName: string;
  role: HostRole;
};

export function shopifyOperator(session: ShopifySessionIdentity): OperatorContext {
  return {
    shop: session.shop,
    source: "SHOPIFY_ADMIN",
    actorId: session.id,
    actorDisplayName: "Shopify Admin",
    role: "SHOPIFY_ADMIN",
  };
}

export function hostOperator(host: HostIdentity): OperatorContext {
  return {
    shop: host.shop,
    source: "HOST_PORTAL",
    actorId: host.actorId,
    actorDisplayName: host.actorDisplayName,
    role: host.role,
  };
}

export async function requireShopifyOperator(
  request: Request,
): Promise<OperatorContext> {
  const { session } = await authenticate.admin(request);
  return shopifyOperator(session);
}

export async function requireHostOperator(
  request: Request,
): Promise<OperatorContext> {
  const host = await requireHostUser(request);
  return hostOperator(host);
}
