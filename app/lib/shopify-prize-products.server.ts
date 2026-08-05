import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { PrizePackageOption, ProductPrizeBallSelection } from "./prize-packages.ts";
import { DOMESTIC_BALL_WEIGHTS } from "./prize-packages.ts";

export type PublicPrizeProduct = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type PrizeCollectionChoice = {
  id: string;
  title: string;
  handle: string;
  updatedAt: string;
  imageUrl: string | null;
  imageAlt: string | null;
  productCount: number | null;
};

type ProductNode = {
  id: string; title: string; handle: string; status: string;
  featuredImage: { url: string; altText: string | null } | null;
};

const COLLECTIONS_QUERY = `#graphql
  query PrizeCollections($ids: [ID!]!) {
    nodes(ids: $ids) { ... on Collection { id title handle } }
  }`;

const COLLECTION_LIST_QUERY = `#graphql
  query PrizeClaimCollections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: TITLE) {
      nodes {
        id title handle updatedAt
        image { url altText }
        productsCount { count }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const COLLECTION_PRODUCTS_QUERY = `#graphql
  query PrizeCollectionProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      id title handle
      products(first: $first, after: $after) {
        nodes { id title handle status featuredImage { url altText } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;

export async function verifyPrizeOptionCollections(admin: AdminApiContext, options: PrizePackageOption[]) {
  const ids = [...new Set(options.map((option) => option.collectionId).filter((id): id is string => Boolean(id)))];
  const response = await admin.graphql(COLLECTIONS_QUERY, { variables: { ids } });
  const payload = await response.json() as { data?: { nodes?: Array<{ id: string; title: string; handle: string } | null> } };
  const collections = new Map((payload.data?.nodes ?? []).filter((node): node is { id: string; title: string; handle: string } => Boolean(node)).map((node) => [node.id, node]));
  if (collections.size !== ids.length) throw new Error("One or more selected collections are unavailable in this Shopify store.");
  return options.map((option) => {
    const collection = option.collectionId ? collections.get(option.collectionId) : null;
    if (!collection) throw new Error(`The collection for “${option.label}” is unavailable.`);
    return { ...option, collectionTitle: collection.title, collectionHandle: collection.handle };
  });
}

function collectionSearchQuery(search: string) {
  const normalized = search.trim().replace(/[\\:*()]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return null;
  return `title:*${normalized}* OR handle:*${normalized}*`;
}

export async function listPrizeCollections(admin: AdminApiContext, input: { after?: string | null; search?: string; first?: number } = {}) {
  const first = Math.min(Math.max(input.first ?? 50, 1), 50);
  const response = await admin.graphql(COLLECTION_LIST_QUERY, {
    variables: { first, after: input.after || null, query: collectionSearchQuery(input.search ?? "") },
  });
  const payload = await response.json() as {
    data?: { collections?: { nodes: Array<{ id: string; title: string; handle: string; updatedAt: string; image: { url: string; altText: string | null } | null; productsCount?: { count: number } | null }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length) throw new Error("Shopify could not load collections.");
  const connection = payload.data?.collections;
  if (!connection) throw new Error("Shopify returned no collection data.");
  const collections: PrizeCollectionChoice[] = connection.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    updatedAt: node.updatedAt,
    imageUrl: node.image?.url ?? null,
    imageAlt: node.image?.altText ?? null,
    productCount: typeof node.productsCount?.count === "number" ? node.productsCount.count : null,
  }));
  if (process.env.NODE_ENV === "development") {
    console.info("Prize collection query:", { count: collections.length, collections: collections.map(({ id, title }) => ({ id, title })), pageInfo: connection.pageInfo });
  }
  return { collections, pageInfo: connection.pageInfo };
}

async function getCollectionPage(admin: AdminApiContext, collectionId: string, after: string | null, first = 50) {
  const response = await admin.graphql(COLLECTION_PRODUCTS_QUERY, { variables: { id: collectionId, first, after } });
  const payload = await response.json() as { data?: { collection?: { id: string; title: string; handle: string; products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } };
  return payload.data?.collection ?? null;
}

export async function loadPublicPrizeProducts(admin: AdminApiContext, option: PrizePackageOption, limit = 100) {
  if (!option.collectionId) return [];
  const products: PublicPrizeProduct[] = [];
  let after: string | null = null;
  do {
    const collection = await getCollectionPage(admin, option.collectionId, after, Math.min(50, limit - products.length));
    if (!collection) return [];
    products.push(...collection.products.nodes.filter((product) => product.status === "ACTIVE").map(publicProduct));
    if (!collection.products.pageInfo.hasNextPage || !collection.products.pageInfo.endCursor || products.length >= limit) break;
    after = collection.products.pageInfo.endCursor;
  } while (products.length < limit);
  return products.slice(0, limit);
}

function publicProduct(product: ProductNode): PublicPrizeProduct {
  return { id: product.id, title: product.title, handle: product.handle, imageUrl: product.featuredImage?.url ?? null, imageAlt: product.featuredImage?.altText ?? null };
}

export async function resolveSubmittedPrizeProducts(
  admin: AdminApiContext,
  option: PrizePackageOption,
  productIds: string[],
  weights: Array<string | null>,
): Promise<ProductPrizeBallSelection[]> {
  if (!option.collectionId || !option.collectionTitle) throw new Error("This prize option does not have a Shopify collection.");
  if (productIds.length !== option.ballCount) throw new Error(`Choose exactly ${option.ballCount} bowling ${option.ballCount === 1 ? "ball" : "balls"}.`);
  if (option.ballType === "DOMESTIC" && weights.length !== option.ballCount) throw new Error("Select a weight between 13 lb and 16 lb.");
  const wanted = new Set(productIds);
  const found = new Map<string, ProductNode>();
  let after: string | null = null;
  do {
    const collection = await getCollectionPage(admin, option.collectionId, after);
    if (!collection) throw new Error("The configured Shopify collection is unavailable.");
    for (const product of collection.products.nodes) if (wanted.has(product.id) && product.status === "ACTIVE") found.set(product.id, product);
    if (found.size === wanted.size || !collection.products.pageInfo.hasNextPage) break;
    after = collection.products.pageInfo.endCursor;
  } while (after);
  if (found.size !== wanted.size) throw new Error("A selected product is no longer available in this prize collection. Choose another product.");
  return productIds.map((productId, index) => {
    const product = found.get(productId)!;
    const submittedWeight = option.ballType === "DOMESTIC" ? weights[index]?.trim() ?? "" : "";
    const parsedWeight = Number(submittedWeight);
    const weight = option.ballType === "DOMESTIC" ? parsedWeight : null;
    if (
      option.ballType === "DOMESTIC" &&
      (!/^\d+$/.test(submittedWeight) ||
        !Number.isInteger(parsedWeight) ||
        !DOMESTIC_BALL_WEIGHTS.includes(
          parsedWeight as (typeof DOMESTIC_BALL_WEIGHTS)[number],
        ))
    )
      throw new Error("Select a weight between 13 lb and 16 lb.");
    return {
      position: index + 1, productId: product.id, productTitle: product.title, productHandle: product.handle,
      productImageUrl: product.featuredImage?.url ?? null, productImageAlt: product.featuredImage?.altText ?? null,
      collectionId: option.collectionId!, collectionTitle: option.collectionTitle!, weightPounds: weight,
    };
  });
}
