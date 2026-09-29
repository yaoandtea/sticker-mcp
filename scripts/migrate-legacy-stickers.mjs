import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif"
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "if-empty") args.ifEmpty = true;
    else args[key] = argv[++i];
  }
  return args;
}

async function readJson(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Manifest download failed: HTTP ${response.status}`);
    return response.json();
  }
  return JSON.parse(await fs.readFile(path.resolve(source), "utf8"));
}

async function targetHasStickers(dataDir) {
  try {
    const current = JSON.parse(await fs.readFile(path.join(dataDir, "stickers.json"), "utf8"));
    return Array.isArray(current) && current.length > 0;
  } catch {
    return false;
  }
}

async function loadImage(sticker, assetsDir) {
  const sourceName = path.basename(new URL(sticker.imageUrl).pathname);
  if (assetsDir) {
    const localPath = path.join(path.resolve(assetsDir), sourceName);
    return { filename: sourceName, buffer: await fs.readFile(localPath) };
  }
  const response = await fetch(sticker.imageUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Image download failed for ${sticker.id}: HTTP ${response.status}`);
  return { filename: sourceName, buffer: Buffer.from(await response.arrayBuffer()) };
}

export async function migrateLegacy({ manifest, assetsDir, dataDir, ifEmpty = false }) {
  if (!manifest || !dataDir) throw new Error("--manifest and --data-dir are required");
  const resolvedDataDir = path.resolve(dataDir);
  if (ifEmpty && await targetHasStickers(resolvedDataDir)) {
    return { skipped: true, count: 0 };
  }

  const legacy = await readJson(manifest);
  if (!Array.isArray(legacy)) throw new Error("Legacy manifest must be an array");
  const imageDir = path.join(resolvedDataDir, "images");
  await fs.mkdir(imageDir, { recursive: true });

  const seen = new Set();
  const migrated = [];
  for (const item of legacy) {
    const id = String(item?.id ?? "").trim();
    const name = String(item?.name ?? "").trim();
    const labels = Array.isArray(item?.labels)
      ? item.labels.map((label) => String(label).trim()).filter(Boolean)
      : [];
    if (!id || !name || labels.length === 0 || typeof item?.imageUrl !== "string") {
      throw new Error(`Invalid legacy sticker: ${id || "<missing id>"}`);
    }
    if (seen.has(id)) throw new Error(`Duplicate sticker id: ${id}`);
    seen.add(id);

    const { filename, buffer } = await loadImage(item, assetsDir);
    const metadata = await sharp(buffer, { animated: true }).metadata();
    const mimeType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
    if (!mimeType) throw new Error(`Unsupported image format for ${id}: ${metadata.format ?? "unknown"}`);
    const destination = path.join(imageDir, filename);
    await fs.writeFile(destination, buffer);
    migrated.push({
      id,
      name,
      emotions: labels,
      filepath: destination,
      mimeType
    });
  }

  const output = path.join(resolvedDataDir, "stickers.json");
  const temporary = `${output}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(migrated, null, 2)}\n`);
  await fs.rename(temporary, output);
  return { skipped: false, count: migrated.length };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  migrateLegacy({
    manifest: args.manifest,
    assetsDir: args["assets-dir"],
    dataDir: args["data-dir"],
    ifEmpty: Boolean(args.ifEmpty)
  }).then((result) => {
    console.log(result.skipped
      ? "Sticker data already exists; legacy seed skipped."
      : `Migrated ${result.count} legacy stickers without image re-encoding.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
