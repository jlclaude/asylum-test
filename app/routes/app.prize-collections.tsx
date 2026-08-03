import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { listPrizeCollections } from "../lib/shopify-prize-products.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const scopes = new Set((session.scope ?? "").split(",").map((scope) => scope.trim()));
  const hasProductRead = scopes.has("read_products") || scopes.has("write_products");
  if (!hasProductRead) {
    return data({ error: "Product access is not granted. Restart Shopify development and approve the read_products scope.", collections: [], pageInfo: { hasNextPage: false, endCursor: null }, scopeGranted: false }, { status: 403 });
  }
  const url = new URL(request.url);
  const scopeNotice = !scopes.has("read_products") && scopes.has("write_products")
    ? "The current session predates the explicit read_products scope. Product reads work through write_products, but restart Shopify development and reauthorize the app to refresh granted scopes."
    : null;
  try {
    const result = await listPrizeCollections(admin, { search: url.searchParams.get("search") ?? "", after: url.searchParams.get("after") });
    return { ...result, scopeGranted: true, scopeNotice, error: null };
  } catch (error) {
    console.error("Prize collection search failed:", error);
    return data({ error: "Collections could not be loaded from Shopify. Reauthorize the app and try again.", collections: [], pageInfo: { hasNextPage: false, endCursor: null }, scopeGranted: true, scopeNotice }, { status: 502 });
  }
}

export default function PrizeCollectionsResourceRoute() {
  return null;
}
