import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const builder = source(
  "../app/components/prize-claims/PrizePackageBuilder.tsx",
);
const embeddedPicker = source(
  "../app/components/prize-claims/EmbeddedCollectionPicker.tsx",
);
const hostPicker = source(
  "../app/components/prize-claims/HostCollectionPicker.tsx",
);
const sharedPicker = source(
  "../app/components/prize-claims/CollectionPicker.tsx",
);
const hostResource = source(
  "../app/routes/host.resources.collections.tsx",
);

test("prize package builder chooses a route-specific collection adapter", () => {
  assert.match(builder, /routeMode === "HOST_PORTAL"/);
  assert.match(builder, /HostCollectionPicker/);
  assert.match(builder, /EmbeddedCollectionPicker/);
  assert.match(embeddedPicker, /resourceUrl="\/app\/prize-collections"/);
  assert.match(hostPicker, /resourceUrl="\/host\/resources\/collections"/);
});

test("Host collection picker has no App Bridge dependency or app route", () => {
  for (const code of [hostPicker, sharedPicker]) {
    assert.doesNotMatch(code, /app-bridge|useAppBridge|resourcePicker/);
    assert.doesNotMatch(code, /\/app\/prize-collections/);
  }
});

test("Host collection endpoint authenticates Host permission and uses offline Admin context", () => {
  assert.match(
    hostResource,
    /requireHostPermission\(request, "prizeClaims:manage"\)/,
  );
  assert.match(hostResource, /getHostAdminContext\(host\.shop\)/);
  assert.match(hostResource, /listPrizeCollections\(admin/);
  assert.doesNotMatch(hostResource, /authenticate\.admin|accessToken|Session/);
  assert.doesNotMatch(hostResource, /request.*shop|searchParams\.get\("shop"\)/);
});

test("Host picker failures remain visible and never expose raw script HTML", () => {
  assert.match(sharedPicker, /role="alert"/);
  assert.match(
    hostResource,
    /Shopify product access needs to be reauthorized/,
  );
  assert.doesNotMatch(hostResource, /<script|app-bridge\.js/);
});
