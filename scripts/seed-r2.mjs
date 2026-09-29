import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedDir = path.join(root, "seed", "legacy");
const bucket = "xiaoyao-xiaocha-stickers-v2";

const mimeByExtension = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif"
};

export function buildR2Manifest(legacy) {
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
  const local = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  return new Promise((resolve, reject) => {
    const child = spawn(local, args, { cwd: root, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`wrangler exited with ${code}`)));
  });
}

async function main() {
  const legacy = JSON.parse((await fs.readFile(path.join(seedDir, "stickers.json"), "utf8")).replace(/^\uFEFF/, ""));
  const manifest = buildR2Manifest(legacy);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoyao-r2-seed-"));
  try {
    const manifestPath = path.join(tempDir, "stickers.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await runWrangler(["r2", "object", "put", `${bucket}/stickers.json`, "--file", manifestPath, "--content-type", "application/json", "--remote", "--force"]);
    for (const sticker of manifest) {
      const filename = path.basename(sticker.filepath);
      await runWrangler(["r2", "object", "put", `${bucket}/${sticker.filepath}`, "--file", path.join(seedDir, "assets", filename), "--content-type", sticker.mimeType, "--remote", "--force"]);
    }
    console.log(`Seeded ${manifest.length} stickers into R2 without re-encoding image bytes.`);
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
