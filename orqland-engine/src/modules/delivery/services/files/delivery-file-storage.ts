import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { deliveryConfig } from '@/config/delivery.config';
import { KycCryptoService } from '../kyc/kyc-crypto.service';

/** Where delivery document bytes are kept. The database row (delivery_files) is the access-controlled index. */
export interface DeliveryFileStorage {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const DELIVERY_FILE_STORAGE = Symbol('DELIVERY_FILE_STORAGE');

/**
 * Standalone build: files are AES-256-GCM encrypted on local disk (DELIVERY_UPLOAD_DIR).
 * On merge, bind DELIVERY_FILE_STORAGE to a class that writes to your private GCP bucket
 * (uniform bucket-level access, no public URLs) — the rest of the module does not change.
 */
@Injectable()
export class LocalEncryptedFileStorage implements DeliveryFileStorage {
  private readonly root = resolve(deliveryConfig.uploads.dir);

  constructor(private readonly crypto: KycCryptoService) {}

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, this.crypto.encryptBuffer(data), { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return this.crypto.decryptBuffer(await readFile(this.pathFor(key)));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return path;
  }
}
