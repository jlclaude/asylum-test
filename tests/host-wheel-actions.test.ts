import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { hostRoleAllows } from "../app/lib/host-permissions.ts";

const wheelSectionSource = readFileSync(
  new URL("../app/components/wheel/WheelSection.tsx", import.meta.url),
  "utf8",
);
const hostGameModeSource = readFileSync(
  new URL("../app/routes/host_.games.$id_.play.tsx", import.meta.url),
  "utf8",
);

test("Host wheel-operation capability allows OWNER and HOST only", () => {
  assert.equal(hostRoleAllows("OWNER", "wheels:operate"), true);
  assert.equal(hostRoleAllows("HOST", "wheels:operate"), true);
  assert.equal(hostRoleAllows("MODERATOR", "wheels:operate"), false);
  assert.equal(hostRoleAllows("VIEWER", "wheels:operate"), false);
});

test("native wheel-control forms submit to the current route with Host CSRF", () => {
  for (const intent of ["shuffle-wheel", "select-duration", "spin-wheel"]) {
    const intentPosition = wheelSectionSource.indexOf(`value="${intent}"`);
    assert.notEqual(intentPosition, -1, `${intent} form is present`);
    const formEnd = wheelSectionSource.indexOf("</fetcher.Form>", intentPosition);
    const formSource = wheelSectionSource.slice(intentPosition, formEnd);
    assert.match(formSource, /name="csrfToken" value=\{csrfToken\}/);
  }

  assert.doesNotMatch(wheelSectionSource, /action=\{?`?\/app\/games\//);
});

test("Host Game Mode authenticates mutations with Host wheel permission", () => {
  assert.match(
    hostGameModeSource,
    /requireHostMutation\([\s\S]*?"wheels:operate"/,
  );
  assert.doesNotMatch(hostGameModeSource, /authenticate\.admin/);
  assert.match(hostGameModeSource, /routeFamily:\s*"HOST_PORTAL"/);
});
