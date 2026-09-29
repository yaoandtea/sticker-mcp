import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStickerServer } from "../src/mcp.js";
import type { Sticker, StickerStorageLike, StickerWithThumb } from "../src/storage-contract.js";

class UpdateTestStorage implements StickerStorageLike {
  private sticker: Sticker = {
    id: "kiss_kiss_01",
    name: "亲亲啵啵",
    emotions: ["亲亲", "贴贴"],
    filepath: "images/kiss_kiss_01.jpg",
    mimeType: "image/jpeg"
  };
  readonly imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);

  async init() {}
  async getAllStickers() { return [{ ...this.sticker, emotions: [...this.sticker.emotions] }]; }
  async getById(id: string) { return id === this.sticker.id ? { ...this.sticker, emotions: [...this.sticker.emotions] } : null; }
  async findByQuery() { return { picked: this.sticker, matches: [this.sticker] }; }
  async addSticker(): Promise<Sticker> { throw new Error("not used"); }
  async addStickerFromBase64(): Promise<Sticker> { throw new Error("not used"); }
  async updateSticker(id: string, patch: { name?: string; emotions?: string[] }) {
    if (id !== this.sticker.id) return null;
    this.sticker = {
      ...this.sticker,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.emotions !== undefined ? { emotions: [...patch.emotions] } : {})
    };
    return { ...this.sticker, emotions: [...this.sticker.emotions] };
  }
  async deleteSticker() { return false; }
  publicFilename(sticker: Sticker) { return sticker.filepath.split("/").at(-1)!; }
  async readForInline(sticker: Sticker) { return { buffer: Buffer.from(this.imageBytes), mimeType: sticker.mimeType }; }
  async withThumbs(stickers: Sticker[]): Promise<StickerWithThumb[]> { return stickers.map((sticker) => ({ ...sticker, thumb: null })); }
}

test("update_sticker changes name and tags while preserving the original image", async () => {
  const storage = new UpdateTestStorage();
  const before = await storage.getById("kiss_kiss_01");
  const bytesBefore = (await storage.readForInline(before!)).buffer;
  const server = createStickerServer({
    port: 3000,
    publicBaseUrl: "https://stickers.example.test",
    dataDir: "unused",
    mcpHttpPath: "/mcp/sticker",
    allowedOrigins: [],
    adminToken: null
  }, storage);
  const client = new Client({ name: "update-sticker-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "update_sticker"));

    const result = await client.callTool({
      name: "update_sticker",
      arguments: {
        stickerId: "kiss_kiss_01",
        name: "气鼓鼓瞪你",
        tags: ["生气", "气鼓鼓", "炸毛", "不满", "闹脾气"]
      }
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      id: "kiss_kiss_01",
      name: "气鼓鼓瞪你",
      emotions: ["生气", "气鼓鼓", "炸毛", "不满", "闹脾气"],
      imageUnchanged: true
    });

    const after = await storage.getById("kiss_kiss_01");
    assert.equal(after?.filepath, before?.filepath);
    assert.equal(after?.mimeType, before?.mimeType);
    assert.deepEqual((await storage.readForInline(after!)).buffer, bytesBefore);
  } finally {
    await client.close();
    await server.close();
  }
});
