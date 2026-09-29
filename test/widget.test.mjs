import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("widget is a compact transparent inline sticker and uses a bumped resource URI", async () => {
  const source = await fs.readFile(path.join(root, "src", "widget", "sticker-view-html.ts"), "utf8");
  assert.match(source, /xiaoyao-xiaocha-mcp-app-v8\.html/);
  assert.match(source, /max-width:\s*180px/);
  assert.match(source, /max-height:\s*180px/);
  assert.match(source, /background:\s*transparent/);
  assert.doesNotMatch(source, /max-width:\s*200px/);
});

test("selection instructions keep candidate lists internal and support exact ids", async () => {
  const source = await fs.readFile(path.join(root, "src", "mcp.ts"), "utf8");
  assert.match(source, /Do not expose candidate lists to the user/);
  assert.match(source, /stickerId/);
  assert.match(source, /list_available_stickers/);
  assert.match(source, /update_sticker/);
  assert.match(source, /imageUnchanged/);
  assert.match(source, /send_sticker/);
});

test("widget keeps both ChatGPT and MCP Apps/Work result bridges", async () => {
  const source = await fs.readFile(path.join(root, "src", "widget", "sticker-view-widget.ts"), "utf8");
  assert.match(source, /window\.openai/);
  assert.match(source, /openai:set_globals/);
  assert.match(source, /ui\/notifications\/tool-result/);
  assert.match(source, /new App\(/);
  assert.match(source, /addEventListener\("toolresult"/);
  assert.match(source, /await app\.connect\(\)/);
});
