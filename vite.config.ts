import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readdirSync } from "node:fs";
import { extname, resolve } from "node:path";

const SUPPORTED_MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
function scanMusicFolder(folder: string, kind: "idle" | "spin") {
  const directory = resolve(process.cwd(), "public", "music", folder);
  let files: string[] = [];
  try {
    files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && SUPPORTED_MUSIC_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    if (process.env.NODE_ENV !== "production") console.warn(`[Asylum music] Folder unavailable: ${directory}`);
  }
  if (files.length === 0 && process.env.NODE_ENV !== "production") {
    console.warn(`[Asylum music] No supported audio files found in ${directory}`);
  }
  return files.map((file) => ({
    id: `${kind}:${file}`,
    label: file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(),
    file: `/music/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
  }));
}

const preSpinMusicLibrary = scanMusicFolder("pre-spin music", "idle");
const spinMusicLibrary = scanMusicFolder("spin music", "spin");

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const appUrl = new URL(
  process.env.SHOPIFY_APP_URL || "http://localhost",
);
const host = appUrl.hostname;

let hmrConfig;
if (host === "localhost" && appUrl.protocol === "https:") {
  // Shopify CLI's local HTTPS proxy does not forward WebSocket upgrades,
  // and its dedicated HMR port serves plain WS. Disable HMR in this one
  // configuration so the secure page never tries to open a TLS socket to it.
  hmrConfig = false;
} else if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  define: {
    __ASYLUM_PRE_SPIN_TRACKS__: JSON.stringify(preSpinMusicLibrary),
    __ASYLUM_SPIN_TRACKS__: JSON.stringify(spinMusicLibrary),
  },
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
