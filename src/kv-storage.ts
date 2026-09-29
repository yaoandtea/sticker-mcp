import { Buffer } from "node:buffer";
import { ALLOWED_IMAGE_MIME, detectImageMime, extensionForMime } from "./image-mime.js";
import type { Sticker, StickerStorageLike, StickerWithThumb } from "./storage-contract.js";

export interface KVNamespaceLike {
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

const MANIFEST_KEY = "stickers.json";

export class KVStickerStorage implements StickerStorageLike {
  constructor(private namespace: KVNamespaceLike) {}

  async init() {
    if (!await this.namespace.get(MANIFEST_KEY, "text")) await this.writeManifest([]);
  }

  private async writeManifest(stickers: Sticker[]) {
    await this.namespace.put(MANIFEST_KEY, `${JSON.stringify(stickers, null, 2)}\n`);
  }

  async getAllStickers(): Promise<Sticker[]> {
    const text = await this.namespace.get(MANIFEST_KEY, "text");
    return text ? JSON.parse(text.replace(/^\uFEFF/, "")) as Sticker[] : [];
  }

  async getById(id: string) {
    return (await this.getAllStickers()).find((sticker) => sticker.id === id) ?? null;
  }

  async findByQuery(query: string) {
    const stickers = await this.getAllStickers();
    const q = query.trim().toLowerCase();
    const matches = stickers.filter((sticker) => [...sticker.emotions, sticker.name]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(q) || (value.length >= 2 && q.includes(value))));
    return { matches, picked: matches[Math.floor(Math.random() * matches.length)] ?? null };
  }

  async addSticker(name: string, emotions: string[], imageBuffer: Buffer, mimeType: string) {
    if (imageBuffer.length === 0) throw new Error("Image is empty.");
    const detected = detectImageMime(imageBuffer, mimeType);
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(detected)) throw new Error(`Unsupported image type '${detected || mimeType}'.`);
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const key = `images/${id}.${extensionForMime(detected)}`;
    await this.namespace.put(key, imageBuffer);
    const sticker: Sticker = {
      id,
      name: name.trim(),
      emotions: emotions.map((tag) => tag.trim()).filter(Boolean),
      filepath: key,
      mimeType: detected,
      addedAt: new Date().toISOString()
    };
    const stickers = await this.getAllStickers();
    stickers.push(sticker);
    await this.writeManifest(stickers);
    return sticker;
  }

  async addStickerFromBase64(name: string, emotions: string[], base64Data: string, mimeType: string) {
    const cleaned = base64Data.replace(/^data:image\/[\w.+-]+;base64,/, "");
    return this.addSticker(name, emotions, Buffer.from(cleaned, "base64"), mimeType);
  }

  async updateSticker(id: string, patch: { name?: string; emotions?: string[] }) {
    const stickers = await this.getAllStickers();
    const sticker = stickers.find((candidate) => candidate.id === id);
    if (!sticker) return null;
    if (patch.name !== undefined) sticker.name = patch.name.trim();
    if (patch.emotions !== undefined) sticker.emotions = patch.emotions.map((tag) => tag.trim()).filter(Boolean);
    await this.writeManifest(stickers);
    return sticker;
  }

  async deleteSticker(id: string) {
    const stickers = await this.getAllStickers();
    const index = stickers.findIndex((candidate) => candidate.id === id);
    if (index === -1) return false;
    const [deleted] = stickers.splice(index, 1);
    await this.writeManifest(stickers);
    if (deleted) await this.namespace.delete(deleted.filepath);
    return true;
  }

  publicFilename(sticker: Sticker) {
    return sticker.filepath.split("/").pop() ?? sticker.filepath;
  }

  async readForInline(sticker: Sticker) {
    const bytes = await this.namespace.get(sticker.filepath, "arrayBuffer");
    if (!bytes) throw new Error(`Missing image for sticker '${sticker.id}'.`);
    return { buffer: Buffer.from(bytes), mimeType: sticker.mimeType };
  }

  async withThumbs(stickers: Sticker[]): Promise<StickerWithThumb[]> {
    return stickers.map((sticker) => ({ ...sticker, thumb: null }));
  }

  async getObject(key: string) {
    const bytes = await this.namespace.get(key, "arrayBuffer");
    if (!bytes) return null;
    const buffer = Buffer.from(bytes);
    return { buffer, mimeType: detectImageMime(buffer, "application/octet-stream") };
  }
}
