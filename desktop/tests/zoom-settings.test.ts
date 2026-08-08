import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adjacentZoom,
  DesktopZoomStore,
  normalizeZoom,
} from "../main/zoom-settings";

async function run() {
  assert.equal(normalizeZoom(1.25), 1.25);
  assert.equal(normalizeZoom(99), 1);
  assert.equal(adjacentZoom(1, 1), 1.1);
  assert.equal(adjacentZoom(1, -1), 0.9);
  assert.equal(adjacentZoom(2, 1), 2);
  assert.equal(adjacentZoom(0.75, -1), 0.75);

  const directory = await mkdtemp(join(tmpdir(), "asylum-zoom-"));
  try {
    const store = new DesktopZoomStore(join(directory, "desktop-zoom.json"));
    assert.deepEqual(await store.load(), {
      host: 1,
      facebook: 1,
      broadcast: 1,
      studio: 1,
    });
    await store.save({ host: 1.25, facebook: 0.9, broadcast: 1.5, studio: 1.1 });
    assert.deepEqual(await store.load(), {
      host: 1.25,
      facebook: 0.9,
      broadcast: 1.5,
      studio: 1.1,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.info("Desktop zoom settings tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
