import { unauthenticated } from "../shopify.server";

export async function getHostAdminContext(shop: string) {
  try {
    return (await unauthenticated.admin(shop)).admin;
  } catch (error) {
    console.error("Host Shopify offline session unavailable", {
      shop,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new Response(
      "Shopify access requires reauthorization. An OWNER must reopen or reinstall Asylum Games through Shopify Admin.",
      { status: 503 },
    );
  }
}
