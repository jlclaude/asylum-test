import { data, type LoaderFunctionArgs } from "react-router";
import { requireHostPermission } from "../lib/host-auth.server";
import { getHostAdminContext } from "../lib/host-shopify.server";
import { listPrizeCollections } from "../lib/shopify-prize-products.server";

const emptyResult = {
  collections: [],
  pageInfo: { hasNextPage: false, endCursor: null },
  scopeGranted: false,
  scopeNotice: null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "prizeClaims:manage");
  const url = new URL(request.url);

  try {
    const admin = await getHostAdminContext(host.shop);
    const result = await listPrizeCollections(admin, {
      search: url.searchParams.get("search") ?? "",
      after: url.searchParams.get("after"),
    });
    return {
      ...result,
      scopeGranted: true,
      scopeNotice: null,
      error: null,
    };
  } catch (error) {
    const reauthorizationRequired =
      error instanceof Response && error.status === 503;
    console.error("Host prize collection search failed", {
      shop: host.shop,
      reason: reauthorizationRequired
        ? "OFFLINE_SESSION_UNAVAILABLE"
        : "SHOPIFY_COLLECTION_QUERY_FAILED",
    });
    return data(
      {
        ...emptyResult,
        error: reauthorizationRequired
          ? "Shopify product access needs to be reauthorized. Open Asylum Games once through Shopify Admin."
          : "Collections could not be loaded. Reauthorize Shopify product access and try again.",
      },
      { status: reauthorizationRequired ? 503 : 502 },
    );
  }
}

export default function HostPrizeCollectionsResourceRoute() {
  return null;
}
