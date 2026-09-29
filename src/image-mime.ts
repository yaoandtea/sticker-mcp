export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const;

export function detectImageMime(bytes: Uint8Array, fallback = ""): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
    const box = String.fromCharCode(...bytes.subarray(4, 12));
    if (box.startsWith("ftyp") && /avif|avis/.test(String.fromCharCode(...bytes.subarray(8, 24)))) return "image/avif";
  }
  return fallback.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.split("/")[1]?.replace("+xml", "") || "png";
}
