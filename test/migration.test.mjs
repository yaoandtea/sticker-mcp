import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { migrateLegacy } from "../scripts/migrate-legacy-stickers.mjs";

const root = path.resolve(import.meta.dirname, "..");
const seed = path.join(root, "seed", "legacy");

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

test("migrates the complete legacy library without changing ids, names, tags, or image bytes", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-stickers-"));
  const source = JSON.parse(await fs.readFile(path.join(seed, "stickers.json"), "utf8"));
  const result = await migrateLegacy({
    manifest: path.join(seed, "stickers.json"),
    assetsDir: path.join(seed, "assets"),
    dataDir
  });
  assert.deepEqual(result, { skipped: false, count: source.length });
  assert.equal(source.length, 22);

  const migrated = JSON.parse(await fs.readFile(path.join(dataDir, "stickers.json"), "utf8"));
  assert.deepEqual(migrated.map((item) => item.id), source.map((item) => item.id));
  for (const item of source) {
    const target = migrated.find((candidate) => candidate.id === item.id);
    assert.equal(target.name, item.name);
    assert.deepEqual(target.emotions, item.labels);
    const filename = path.basename(new URL(item.imageUrl).pathname);
    assert.equal(
      await sha256(path.join(dataDir, "images", filename)),
      await sha256(path.join(seed, "assets", filename))
    );
  }
});

test("preserves transparent PNG, JPEG, and animated GIF formats", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 100, alpha: 0.4 } }
  }).png().toBuffer();
  const jpg = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 40, b: 60 } }
  }).jpeg().toBuffer();
  const gif = await fs.readFile(path.join(root, "test", "fixtures", "animated.gif"));

  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-formats-source-"));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-formats-data-"));
  await fs.writeFile(path.join(sourceDir, "transparent.png"), png);
  await fs.writeFile(path.join(sourceDir, "photo.jpg"), jpg);
  await fs.writeFile(path.join(sourceDir, "animated.gif"), gif);
  const manifest = [
    { id: "transparent_png", name: "透明 PNG", labels: ["透明"], imageUrl: "https://example.test/transparent.png" },
    { id: "jpeg_photo", name: "JPG", labels: ["照片"], imageUrl: "https://example.test/photo.jpg" },
    { id: "animated_gif", name: "GIF", labels: ["动图"], imageUrl: "https://example.test/animated.gif" }
  ];
  const manifestPath = path.join(sourceDir, "stickers.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));

  await migrateLegacy({ manifest: manifestPath, assetsDir: sourceDir, dataDir });
  const migrated = JSON.parse(await fs.readFile(path.join(dataDir, "stickers.json"), "utf8"));
  assert.deepEqual(migrated.map((item) => item.mimeType), ["image/png", "image/jpeg", "image/gif"]);
  assert.equal((await sharp(path.join(dataDir, "images", "transparent.png")).metadata()).hasAlpha, true);
  assert.equal((await sharp(path.join(dataDir, "images", "photo.jpg")).metadata()).format, "jpeg");
  const gifMeta = await sharp(path.join(dataDir, "images", "animated.gif"), { animated: true }).metadata();
  assert.equal(gifMeta.format, "gif");
  assert.ok((gifMeta.pages ?? 1) > 1, "GIF must remain animated");
});

test("--if-empty does not overwrite an existing managed library", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-existing-"));
  await fs.writeFile(path.join(dataDir, "stickers.json"), JSON.stringify([{ id: "managed" }]));
  const result = await migrateLegacy({
    manifest: path.join(seed, "stickers.json"),
    assetsDir: path.join(seed, "assets"),
    dataDir,
    ifEmpty: true
  });
  assert.deepEqual(result, { skipped: true, count: 0 });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, "stickers.json"), "utf8")), [{ id: "managed" }]);
});
