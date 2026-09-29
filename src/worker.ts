import { Buffer } from "node:buffer";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import adminHtml from "./admin/admin.html";
import widgetScript from "./widget/sticker-view-widget.global.js";
import type { AppConfig } from "./config.js";
import { createStickerServer } from "./mcp.js";
import { KVStickerStorage, type KVNamespaceLike } from "./kv-storage.js";
import type { StickerUploadSlot } from "./upload-slots.js";

interface Env {
  STICKERS: KVNamespaceLike;
  PUBLIC_BASE_URL?: string;
  ADMIN_TOKEN?: string;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_MS = 10 * 60 * 1000;

function cors(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set("Access-Control-Allow-Origin", "*");
  result.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  result.headers.set("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id");
  result.headers.set("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  return result;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function isAdmin(request: Request, env: Env) {
  if (!env.ADMIN_TOKEN) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.ADMIN_TOKEN}`;
}

function configFor(request: Request, env: Env): AppConfig {
  const origin = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
  return {
    port: 443,
    publicBaseUrl: origin,
    dataDir: "kv://STICKERS",
    mcpHttpPath: "/mcp/sticker",
    allowedOrigins: [origin],
    adminToken: env.ADMIN_TOKEN?.trim() || null
  };
}

function uploadKey(token: string) {
  return `upload-slots/${token}.json`;
}

async function createUploadSlot(env: Env, name: string, emotions: string[]): Promise<StickerUploadSlot> {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const slot = {
    token,
    name: name.trim(),
    emotions: emotions.map((tag) => tag.trim()).filter(Boolean),
    expiresAt: Date.now() + UPLOAD_TTL_MS
  };
  await env.STICKERS.put(uploadKey(token), JSON.stringify(slot), {
    expiration: Math.ceil(slot.expiresAt / 1000)
  });
  return slot;
}

async function readUploadSlot(env: Env, token: string): Promise<StickerUploadSlot | null> {
  const text = await env.STICKERS.get(uploadKey(token), "text");
  if (!text) return null;
  const slot = JSON.parse(text) as StickerUploadSlot;
  if (slot.expiresAt <= Date.now()) {
    await env.STICKERS.delete(uploadKey(token));
    return null;
  }
  return slot;
}

async function handleApi(request: Request, env: Env, storage: KVStickerStorage, pathname: string) {
  if (!isAdmin(request, env)) return json({ error: "Admin token required" }, 401);

  if (pathname === "/api/stickers" && request.method === "GET") {
    const stickers = await storage.getAllStickers();
    return json(stickers.map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      emotions: sticker.emotions,
      addedAt: sticker.addedAt,
      imageUrl: `/images/${storage.publicFilename(sticker)}`,
      thumb: null
    })));
  }

  if (pathname === "/api/stickers" && request.method === "POST") {
    const body = await request.json() as { name?: string; emotions?: string[]; base64Data?: string; mimeType?: string };
    if (!body.name || !Array.isArray(body.emotions) || !body.base64Data) return json({ error: "name, emotions and base64Data are required" }, 400);
    const sticker = await storage.addStickerFromBase64(body.name, body.emotions, body.base64Data, body.mimeType || "image/png");
    return json({ id: sticker.id }, 201);
  }

  const match = /^\/api\/stickers\/([^/]+)$/.exec(pathname);
  if (match && request.method === "PATCH") {
    const body = await request.json() as { name?: string; emotions?: string[] };
    const sticker = await storage.updateSticker(decodeURIComponent(match[1]!), body);
    return sticker ? json({ success: true }) : json({ error: "not found" }, 404);
  }
  if (match && request.method === "DELETE") {
    const success = await storage.deleteSticker(decodeURIComponent(match[1]!));
    return json({ success }, success ? 200 : 404);
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);
      const storage = new KVStickerStorage(env.STICKERS);
      await storage.init();

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
        const stickers = await storage.getAllStickers();
        return cors(json({ ok: true, service: "xiaoyao-xiaocha-sticker-mcp", transport: "streamable-http", storage: "kv", stickers: stickers.length, mcpEndpoint: `${url.origin}/mcp/sticker` }));
      }

      if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
        return cors(new Response(adminHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      }

      if (request.method === "GET" && url.pathname.startsWith("/images/")) {
        const filename = decodeURIComponent(url.pathname.slice("/images/".length)).split("/").pop();
        if (!filename) return cors(new Response("Not found", { status: 404 }));
        const object = await storage.getObject(`images/${filename}`);
        if (!object) return cors(new Response("Not found", { status: 404 }));
        return cors(new Response(object.buffer, {
          headers: {
            "Content-Type": object.mimeType,
            "Cache-Control": "public, max-age=86400, immutable"
          }
        }));
      }

      const uploadMatch = /^\/api\/(?:stickers\/upload|sticker-upload)\/([^/]+)$/.exec(url.pathname);
      if (uploadMatch && request.method === "PUT") {
        const slot = await readUploadSlot(env, uploadMatch[1]!);
        if (!slot) return cors(json({ error: "Upload URL is invalid or expired" }, 404));
        const bytes = Buffer.from(await request.arrayBuffer());
        if (bytes.length > MAX_UPLOAD_BYTES) return cors(json({ error: "Image exceeds the 8MB limit" }, 413));
        const sticker = await storage.addSticker(slot.name, slot.emotions, bytes, request.headers.get("content-type") || "image/png");
        await env.STICKERS.delete(uploadKey(slot.token));
        return cors(json({ id: sticker.id, name: sticker.name, emotions: sticker.emotions, imageUrl: `${url.origin}/images/${storage.publicFilename(sticker)}` }, 201));
      }

      if (url.pathname === "/api/stickers" || url.pathname.startsWith("/api/stickers/")) {
        return cors(await handleApi(request, env, storage, url.pathname));
      }

      if (url.pathname === "/mcp" || url.pathname === "/mcp/sticker") {
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const server = createStickerServer(configFor(request, env), storage, {
          widgetScript,
          createUploadSlot: (name, emotions) => createUploadSlot(env, name, emotions)
        });
        await server.connect(transport);
        return cors(await transport.handleRequest(request));
      }

      return cors(json({ error: "Not found" }, 404));
    } catch (error) {
      return cors(json({ error: error instanceof Error ? error.message : String(error) }, 500));
    }
  }
};
