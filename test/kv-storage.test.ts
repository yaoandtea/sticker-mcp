import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { KVStickerStorage, type KVNamespaceLike } from "../src/kv-storage.js";

class MemoryKV implements KVNamespaceLike {
  values = new Map<string, string | Uint8Array>();

  async get(key: string, type: "text"): Promise<string | null>;
  async get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  async get(key: string, type: "text" | "arrayBuffer"): Promise<string | ArrayBuffer | null> {
    const value = this.values.get(key);
    if (value === undefined) return null;
    const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
    if (type === "text") return bytes.toString("utf8");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView) {
    this.values.set(key, typeof value === "string"
      ? value
      : Buffer.from(value instanceof ArrayBuffer ? value : value.buffer, value instanceof ArrayBuffer ? 0 : value.byteOffset, value instanceof ArrayBuffer ? value.byteLength : value.byteLength));
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

const fixtures = [
  { name: "PNG", mime: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: "JPG", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
  { name: "GIF", mime: "image/gif", bytes: Buffer.from("GIF89a", "ascii") }
];

test("KV storage preserves image bytes and supports search, exact id, update and delete", async () => {
  const kv = new MemoryKV();
  const storage = new KVStickerStorage(kv);
  await storage.init();

  const created = [];
  for (const fixture of fixtures) {
    const sticker = await storage.addSticker(fixture.name, [fixture.name.toLowerCase(), "测试"], fixture.bytes, fixture.mime);
    created.push(sticker);
    const inline = await storage.readForInline(sticker);
    assert.deepEqual(inline.buffer, fixture.bytes);
    assert.equal(inline.mimeType, fixture.mime);
  }

  const gif = created[2]!;
  assert.equal((await storage.getById(gif.id))?.id, gif.id);
  assert.equal((await storage.findByQuery("gif")).picked?.id, gif.id);
  assert.equal((await storage.updateSticker(gif.id, { name: "会动的 GIF", emotions: ["动图"] }))?.name, "会动的 GIF");
  assert.equal(await storage.deleteSticker(gif.id), true);
  assert.equal(await storage.getById(gif.id), null);
  assert.equal(kv.values.has(gif.filepath), false);
});
