import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createStickerServer } from "./mcp.js";
import { StickerStorage } from "./storage.js";
import fs from "node:fs/promises";
import path from "node:path";
import { detectImageMime } from "./image-mime.js";

const config = loadConfig();
const storage = new StickerStorage(config.dataDir);

async function main() {
  await storage.init();
  const server = createStickerServer(config, storage, {
    readLocalFile: async (filePath) => {
      const absolutePath = path.resolve(filePath);
      const buffer = await fs.readFile(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const fallback = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : `image/${ext.slice(1) || "png"}`;
      return { buffer, mimeType: detectImageMime(buffer, fallback) };
    }
  });
  await server.connect(new StdioServerTransport());
  console.error("sticker-mcp running on stdio");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
