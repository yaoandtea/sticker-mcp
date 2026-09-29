import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("admin page can load before entering the token while management APIs remain protected", async () => {
  const source = await fs.readFile(path.join(root, "src", "server.ts"), "utf8");
  assert.match(source, /app\.get\(\["\/admin", "\/admin\/"\], async/);
  assert.doesNotMatch(source, /app\.get\(\["\/admin", "\/admin\/"\], adminAuth/);
  assert.match(source, /app\.get\("\/api\/stickers", adminAuth/);
  assert.match(source, /app\.post\("\/api\/stickers", adminAuth/);
  assert.match(source, /app\.patch\("\/api\/stickers\/:id", adminAuth/);
  assert.match(source, /app\.delete\("\/api\/stickers\/:id", adminAuth/);
});
