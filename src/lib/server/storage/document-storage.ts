import fs from "node:fs";
import path from "node:path";

export interface DocumentStorage {
  saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  getFile(storagePath: string): Promise<Buffer>;
  getFilePath(storagePath: string): string;
  deleteFile(storagePath: string): Promise<void>;
  saveCrop(cropKey: string, buffer: Buffer): Promise<string>;
}

export class LocalFileSystemStorage implements DocumentStorage {
  private baseDir: string;
  private cropsDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), "data", "storage", "uploads");
    this.cropsDir = path.resolve(process.cwd(), "data", "storage", "crops");

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.cropsDir)) {
      fs.mkdirSync(this.cropsDir, { recursive: true });
    }
  }

  public async saveFile(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(this.baseDir, safeKey);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  public async saveCrop(cropKey: string, buffer: Buffer): Promise<string> {
    const safeKey = cropKey.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(this.cropsDir, safeKey);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  public async getFile(storagePath: string): Promise<Buffer> {
    return await fs.promises.readFile(storagePath);
  }

  public getFilePath(storagePath: string): string {
    return storagePath;
  }

  public async deleteFile(storagePath: string): Promise<void> {
    if (fs.existsSync(storagePath)) {
      await fs.promises.unlink(storagePath);
    }
  }
}

// Singleton storage instance
export const documentStorage: DocumentStorage = new LocalFileSystemStorage();
