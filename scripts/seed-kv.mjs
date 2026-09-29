import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedDir = path.join(root, "seed", "legacy");
const binding = "STICKERS";

const mimeByExtension = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif"
};

export function buildKVManifest(legacy) {
  return legacy.map((item) => {
    const filename = path.basename(new URL(item.imageUrl).pathname);
    return {
      id: item.id,
      name: item.name,
      emotions: item.labels,
      filepath: `images/${filename}`,
      mimeType: mimeByExtension[path.extname(filename).toLowerCase()] || "application/octet-stream"
    };
  });
}

function runWrangler(args) {
  const cli = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`wrangler exited with ${code}`)));
  });
}

async function putFile(key, filepath) {
  await runWrangler(["kv", "key", "put", key, "--path", filepath, "--binding", binding, "--remote"]);
}

async function main() {
  const manifestOnly = process.argv.includes("--manifest-only");
  const legacy = JSON.parse((await fs.readFile(path.join(seedDir, "stickers.json"), "utf8")).replace(/^\uFEFF/, ""));
  const manifest = buildKVManifest(legacy);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-kv-seed-"));
  try {
    const manifestPath = path.join(tempDir, "stickers.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await putFile("stickers.json", manifestPath);
    if (!manifestOnly) {
      for (const sticker of manifest) {
        const filename = path.basename(sticker.filepath);
        await putFile(sticker.filepath, path.join(seedDir, "assets", filename));
      }
    }
    console.log(manifestOnly
      ? `Updated ${manifest.length} sticker metadata entries in Workers KV without touching image bytes.`
      : `Seeded ${manifest.length} stickers into Workers KV without re-encoding image bytes.`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
