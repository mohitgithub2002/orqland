import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import type { DbExecutor } from '@/core/utils/db-executor';
import { assertWorkspaceAccess } from '@/core/utils/workspace-access';
import { deliveryConfig } from '@/config/delivery.config';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryCodRecords,
  deliveryFiles,
  deliverySupportMessages,
  deliverySupportTickets,
  deliveryTasks,
  orders,
  type DeliveryFilePurpose,
} from '@/infrastructure/database/schema';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { PLATFORM_ADMIN_ROLE } from '@/modules/orders/services/shared/orqspace-access.service';
import { DELIVERY_FILE_STORAGE, type DeliveryFileStorage } from './delivery-file-storage';

export type DeliveryFileRow = typeof deliveryFiles.$inferSelect;

/** The subset of an uploaded multipart file the module needs (matches Express.Multer.File). */
export interface UploadedBinary {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_TYPES: Record<DeliveryFilePurpose, string[]> = {
  LICENCE_FRONT: IMAGE_TYPES,
  LICENCE_BACK: IMAGE_TYPES,
  VEHICLE_RC: [...IMAGE_TYPES, 'application/pdf'],
  PROOF_OF_DELIVERY: IMAGE_TYPES,
  COD_PROOF: IMAGE_TYPES,
  SUPPORT_ATTACHMENT: [...IMAGE_TYPES, 'application/pdf'],
  ORDER_INVOICE: [...IMAGE_TYPES, 'application/pdf'],
};
const KYC_PURPOSES: DeliveryFilePurpose[] = ['LICENCE_FRONT', 'LICENCE_BACK', 'VEHICLE_RC'];

/** Checks the leading bytes so a renamed executable cannot be stored as an "image". */
export function sniffMimeType(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

/**
 * Delivery documents: licence front/back and RC captured at registration, proof-of-delivery photos,
 * COD collection proof and support attachments. Every read is authorised against the record the file
 * is attached to; KYC images are visible only to their owner and platform KYC reviewers.
 */
@Injectable()
export class DeliveryFilesService {
  private readonly logger = new Logger('DeliveryFilesService');

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(DELIVERY_FILE_STORAGE) private readonly storage: DeliveryFileStorage,
    private readonly audit: AuditService,
  ) {}

  async upload(user: AuthUser, purpose: DeliveryFilePurpose, file: UploadedBinary | undefined): Promise<DeliveryFileRow> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload');
    if (file.size > deliveryConfig.uploads.maxBytes) {
      throw new PayloadTooLargeException(`Files must be ${Math.round(deliveryConfig.uploads.maxBytes / 1024 / 1024)} MB or smaller`);
    }
    const detected = sniffMimeType(file.buffer);
    if (!detected || !ALLOWED_TYPES[purpose].includes(detected)) {
      const allowed = ALLOWED_TYPES[purpose].map((t) => t.split('/')[1].toUpperCase()).join(', ');
      throw new BadRequestException(`Upload a ${allowed} file`);
    }

    const id = randomUUID();
    const storageKey = `${purpose.toLowerCase()}/${user.id}/${id}`;
    await this.storage.put(storageKey, file.buffer, detected);
    try {
      const [row] = await this.db
        .insert(deliveryFiles)
        .values({
          id,
          ownerUserId: user.id,
          purpose,
          storageKey,
          mimeType: detected,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          originalName: file.originalname?.slice(0, 160) ?? null,
        })
        .returning();
      return row;
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  /**
   * Validates that each file was uploaded by `ownerUserId` for `purpose` and marks it attached.
   * Call inside the transaction that stores the reference.
   */
  async attach(exec: DbExecutor, ownerUserId: string, purpose: DeliveryFilePurpose, fileIds: (string | null | undefined)[]): Promise<void> {
    const ids = [...new Set(fileIds.filter((id): id is string => !!id))];
    if (!ids.length) return;
    const rows = await exec
      .select({ id: deliveryFiles.id, ownerUserId: deliveryFiles.ownerUserId, purpose: deliveryFiles.purpose, deletedAt: deliveryFiles.deletedAt })
      .from(deliveryFiles)
      .where(inArray(deliveryFiles.id, ids));
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.deletedAt || row.ownerUserId !== ownerUserId || row.purpose !== purpose) {
        throw new BadRequestException(`Upload the ${purposeLabel(purpose)} again`);
      }
    }
    await exec.update(deliveryFiles).set({ attachedAt: new Date() }).where(inArray(deliveryFiles.id, ids));
  }

  /**
   * Attaches an uploaded invoice (purpose ORDER_INVOICE) to an order of the caller's workspace.
   * The newest invoice wins; older ones stay on record.
   */
  async attachOrderInvoice(user: AuthUser, orderId: string, fileId: string): Promise<DeliveryFileRow> {
    const [order] = await this.db.select({ orqspaceId: orders.orqspaceId, status: orders.orderStatus }).from(orders).where(eq(orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    if (!(await assertWorkspaceAccess(order.orqspaceId, user.id, this.db))) throw new ForbiddenException('You do not manage this workspace');
    return this.db.transaction(async (tx) => {
      await this.attach(tx, user.id, 'ORDER_INVOICE', [fileId]);
      const [row] = await tx.update(deliveryFiles).set({ orderId }).where(eq(deliveryFiles.id, fileId)).returning();
      await this.audit.record(tx, { entityType: 'order', entityId: orderId, action: 'order.invoice_attached', actorUserId: user.id, actorRole: 'WORKSPACE', after: { fileId } });
      return row;
    });
  }

  async latestInvoice(orderId: string): Promise<DeliveryFileRow | null> {
    const [row] = await this.db
      .select()
      .from(deliveryFiles)
      .where(and(eq(deliveryFiles.orderId, orderId), eq(deliveryFiles.purpose, 'ORDER_INVOICE'), isNull(deliveryFiles.deletedAt)))
      .orderBy(desc(deliveryFiles.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Proof photos must be taken during the delivery (not an older picture from the gallery). */
  async assertCapturedAfter(exec: DbExecutor, fileId: string | null | undefined, after: Date | null, message: string): Promise<void> {
    if (!fileId || !after) return;
    const [row] = await exec.select({ createdAt: deliveryFiles.createdAt }).from(deliveryFiles).where(eq(deliveryFiles.id, fileId));
    if (row && row.createdAt < after) throw new BadRequestException(message);
  }

  /** Returns metadata and bytes after checking the viewer may see the file. */
  async read(user: AuthUser, fileId: string): Promise<{ file: DeliveryFileRow; data: Buffer }> {
    const [file] = await this.db.select().from(deliveryFiles).where(eq(deliveryFiles.id, fileId));
    if (!file || file.deletedAt) throw new NotFoundException('File not found');
    if (!(await this.canRead(user, file))) throw new ForbiddenException('You cannot view this file');
    // Every view of someone else's KYC document by a reviewer is audited (guide §10: restricted access).
    if (KYC_PURPOSES.includes(file.purpose) && file.ownerUserId !== user.id) {
      await this.audit.record(this.db, {
        entityType: 'delivery_file',
        entityId: file.id,
        action: 'kyc_document.viewed',
        actorUserId: user.id,
        actorRole: 'PLATFORM_ADMIN',
        after: { ownerUserId: file.ownerUserId, purpose: file.purpose },
      });
    }
    return { file, data: await this.storage.get(file.storageKey) };
  }

  async canRead(user: AuthUser, file: DeliveryFileRow): Promise<boolean> {
    if (file.ownerUserId === user.id) return true;
    const isPlatform = user.roles.includes(PLATFORM_ADMIN_ROLE);
    if (KYC_PURPOSES.includes(file.purpose)) return isPlatform;
    if (file.purpose === 'SUPPORT_ATTACHMENT') {
      if (isPlatform) return true;
      const [ticket] = await this.db
        .select({ raisedBy: deliverySupportTickets.raisedByUserId })
        .from(deliverySupportMessages)
        .innerJoin(deliverySupportTickets, eq(deliverySupportTickets.id, deliverySupportMessages.ticketId))
        .where(and(eq(deliverySupportMessages.isInternal, false), sql`${file.id}::uuid = ANY(${deliverySupportMessages.attachmentFileIds})`))
        .limit(1);
      return ticket?.raisedBy === user.id;
    }
    if (isPlatform) return true;
    if (file.purpose === 'ORDER_INVOICE') {
      if (!file.orderId) return false;
      const [order] = await this.db.select({ customerId: orders.customerId, orqspaceId: orders.orqspaceId }).from(orders).where(eq(orders.id, file.orderId));
      if (!order) return false;
      return order.customerId === user.id || (await assertWorkspaceAccess(order.orqspaceId, user.id, this.db));
    }
    // Proof of delivery and COD proof: the workspace that owns the delivery.
    const orqspaceId = await this.orqspaceForProof(file);
    return !!orqspaceId && (await assertWorkspaceAccess(orqspaceId, user.id, this.db));
  }

  /** Unattached uploads older than 24 hours are abandoned drafts — delete their bytes. */
  async purgeAbandoned(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await this.db
      .select({ id: deliveryFiles.id, storageKey: deliveryFiles.storageKey })
      .from(deliveryFiles)
      .where(and(isNull(deliveryFiles.attachedAt), isNull(deliveryFiles.deletedAt), lt(deliveryFiles.createdAt, cutoff)))
      .limit(500);
    for (const row of stale) {
      try {
        await this.storage.remove(row.storageKey);
        await this.db.update(deliveryFiles).set({ deletedAt: new Date() }).where(eq(deliveryFiles.id, row.id));
      } catch (error) {
        this.logger.warn(`Could not purge file ${row.id}: ${(error as Error).message}`);
      }
    }
    return stale.length;
  }

  private async orqspaceForProof(file: DeliveryFileRow): Promise<string | null> {
    if (file.purpose === 'PROOF_OF_DELIVERY') {
      const [task] = await this.db.select({ orqspaceId: deliveryTasks.orqspaceId }).from(deliveryTasks).where(eq(deliveryTasks.podFileId, file.id));
      return task?.orqspaceId ?? null;
    }
    const [cod] = await this.db
      .select({ orqspaceId: deliveryCodRecords.orqspaceId })
      .from(deliveryCodRecords)
      .where(eq(deliveryCodRecords.collectionProofFileId, file.id));
    return cod?.orqspaceId ?? null;
  }
}

export function purposeLabel(purpose: DeliveryFilePurpose): string {
  return {
    LICENCE_FRONT: 'licence front image',
    LICENCE_BACK: 'licence back image',
    VEHICLE_RC: 'vehicle RC document',
    PROOF_OF_DELIVERY: 'proof-of-delivery photo',
    COD_PROOF: 'payment proof',
    SUPPORT_ATTACHMENT: 'attachment',
    ORDER_INVOICE: 'invoice',
  }[purpose];
}
