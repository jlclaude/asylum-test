import { cp, mkdir } from "node:fs/promises";

const source = new URL("../renderer/", import.meta.url);
const target = new URL("../dist/renderer/", import.meta.url);
await mkdir(target, { recursive: true });
await Promise.all([
  cp(new URL("index.html", source), new URL("index.html", target)),
  cp(new URL("desktop-shell.css", source), new URL("desktop-shell.css", target)),
  cp(new URL("winner-overlay.html", source), new URL("winner-overlay.html", target)),
  cp(new URL("winner-overlay.css", source), new URL("winner-overlay.css", target)),
]);
