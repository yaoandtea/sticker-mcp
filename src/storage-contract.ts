export interface Sticker {
  id: string;
  name: string;
  emotions: string[];
  /** Local filepath for Node storage, or KV key for Worker storage. */
  filepath: string;
  mimeType: string;
  addedAt?: string;
}

export interface StickerWithThumb extends Sticker {
  thumb: string | null;
}

export interface StickerStorageLike {
  init(): Promise<void>;
  getAllStickers(): Promise<Sticker[]>;
  getById(id: string): Promise<Sticker | null>;
  findByQuery(query: string): Promise<{ picked: Sticker | null; matches: Sticker[] }>;
  addSticker(name: string, emotions: string[], imageBuffer: Buffer, mimeType: string): Promise<Sticker>;
  addStickerFromBase64(name: string, emotions: string[], base64Data: string, mimeType: string): Promise<Sticker>;
  updateSticker(id: string, patch: { name?: string; emotions?: string[] }): Promise<Sticker | null>;
  deleteSticker(id: string): Promise<boolean>;
  publicFilename(sticker: Sticker): string;
  readForInline(sticker: Sticker): Promise<{ buffer: Buffer; mimeType: string }>;
  withThumbs(stickers: Sticker[]): Promise<StickerWithThumb[]>;
}
