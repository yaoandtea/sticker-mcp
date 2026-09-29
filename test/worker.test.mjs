import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildR2Manifest } from "../scripts/seed-r2.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("Cloudflare Worker keeps the MCP widget routes and persists stickers in R2", async () => {
  const source = await fs.readFile(path.join(root, "src", "worker.ts"), "utf8");
  const wrangler = await fs.readFile(path.join(root, "wrangler.jsonc"), "utf8");
  assert.match(source, /WebStandardStreamableHTTPServerTransport/);
  assert.match(source, /createStickerServer/);
  assert.match(source, /widgetScript/);
  assert.match(source, /R2StickerStorage/);
  assert.match(source, /"\/mcp\/sticker"/);
  assert.match(source, /"\/admin"/);
  assert.match(source, /"\/healthz"/);
  assert.match(wrangler, /"binding": "STICKERS"/);
  assert.match(wrangler, /"bucket_name": "xiaoyao-xiaocha-stickers-v2"/);
});

test("R2 seed conversion preserves ids, names, tags and original filenames", () => {
  const source = [{
    id: "animated_gif",
    name: "GIF",
    labels: ["动图"],
    imageUrl: "https://example.test/animated.gif"
  }];
  assert.deepEqual(buildR2Manifest(source), [{
    id: "animated_gif",
    name: "GIF",
    emotions: ["动图"],
    filepath: "images/animated.gif",
    mimeType: "image/gif"
  }]);
});
