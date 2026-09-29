import { Buffer } from "node:buffer";
import { ALLOWED_IMAGE_MIME, detectImageMime, extensionForMime } from "./image-mime.js";
import type { Sticker, StickerStorageLike, StickerWithThumb } from "./storage-contract.js";

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

const MANIFEST_KEY = "stickers.json";

export class R2StickerStorage implements StickerStorageLike {
  constructor(private bucket: R2BucketLike) {}

  async init() {
    if (!await this.bucket.get(MANIFEST_KEY)) await this.writeManifest([]);
  }

  private async writeManifest(stickers: Sticker[]) {
    await this.bucket.put(MANIFEST_KEY, `${JSON.stringify(stickers, null, 2)}\n`, {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
  }

  async getAllStickers(): Promise<Sticker[]> {
    const object = await this.bucket.get(MANIFEST_KEY);
    if (!object) return [];
    return JSON.parse(Buffer.from(await object.arrayBuffer()).toString("utf8").replace(/^\uFEFF/, "")) as Sticker[];
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
    await this.bucket.put(key, imageBuffer, { httpMetadata: { contentType: detected } });
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
    if (deleted) await this.bucket.delete(deleted.filepath);
    return true;
  }

  publicFilename(sticker: Sticker) {
    return sticker.filepath.split("/").pop() ?? sticker.filepath;
  }

  async readForInline(sticker: Sticker) {
    const object = await this.bucket.get(sticker.filepath);
    if (!object) throw new Error(`Missing image for sticker '${sticker.id}'.`);
    return { buffer: Buffer.from(await object.arrayBuffer()), mimeType: object.httpMetadata?.contentType || sticker.mimeType };
  }

  async withThumbs(stickers: Sticker[]): Promise<StickerWithThumb[]> {
    return stickers.map((sticker) => ({ ...sticker, thumb: null }));
  }

  getObject(key: string) {
    return this.bucket.get(key);
  }
}
