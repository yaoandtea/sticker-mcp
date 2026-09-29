import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildKVManifest } from "../scripts/seed-kv.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("Cloudflare Worker keeps the MCP widget routes and persists stickers in KV", async () => {
  const source = await fs.readFile(path.join(root, "src", "worker.ts"), "utf8");
  const wrangler = await fs.readFile(path.join(root, "wrangler.jsonc"), "utf8");
  assert.match(source, /WebStandardStreamableHTTPServerTransport/);
  assert.match(source, /createStickerServer/);
  assert.match(source, /widgetScript/);
  assert.match(source, /\.\/widget\/sticker-view-widget\.global\.js/);
  assert.match(source, /KVStickerStorage/);
  assert.match(source, /"\/mcp\/sticker"/);
  assert.match(source, /"\/admin"/);
  assert.match(source, /"\/healthz"/);
  assert.doesNotMatch(wrangler, /r2_buckets/);
  assert.match(wrangler, /"binding": "STICKERS"/);
  assert.match(wrangler, /"id": "327f4ed63209417491d384209f9841fa"/);
});

test("KV seed conversion preserves ids, names, tags and original filenames", () => {
  const source = [{
    id: "animated_gif",
    name: "GIF",
    labels: ["动图"],
    imageUrl: "https://example.test/animated.gif"
  }];
  assert.deepEqual(buildKVManifest(source), [{
    id: "animated_gif",
    name: "GIF",
    emotions: ["动图"],
    filepath: "images/animated.gif",
    mimeType: "image/gif"
  }]);
});
