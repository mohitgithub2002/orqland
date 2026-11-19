import { ENGINE_ORIGIN, getAuthorizationHeader } from '@/lib/authToken';

export type DeliveryFilePurpose = 'LICENCE_FRONT' | 'LICENCE_BACK' | 'VEHICLE_RC' | 'PROOF_OF_DELIVERY' | 'COD_PROOF' | 'SUPPORT_ATTACHMENT' | 'ORDER_INVOICE';

export interface UploadedDeliveryFile {
  id: string;
  purpose: DeliveryFilePurpose;
  mimeType: string;
  sizeBytes: number;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Delivery documents go through the engine's REST route (multipart), never GraphQL. The returned id is
 * then passed to the GraphQL mutation that uses it (registration, proof of delivery, COD proof, tickets).
 */
export const deliveryFilesService = {
  async upload(file: File, purpose: DeliveryFilePurpose): Promise<UploadedDeliveryFile> {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files must be 8 MB or smaller');
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${ENGINE_ORIGIN}/delivery/files?purpose=${purpose}`, {
      method: 'POST',
      headers: { Authorization: await getAuthorizationHeader() },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Partial<UploadedDeliveryFile> & { message?: string | string[] };
    if (!res.ok || !json.id) {
      const message = Array.isArray(json.message) ? json.message[0] : json.message;
      throw new Error(message ?? `Upload failed (${res.status})`);
    }
    return json as UploadedDeliveryFile;
  },

  /** Fetches an access-controlled file and returns a local object URL (revoke when done). */
  async objectUrl(fileId: string): Promise<string> {
    const res = await fetch(`${ENGINE_ORIGIN}/delivery/files/${fileId}`, { headers: { Authorization: await getAuthorizationHeader() } });
    if (res.status === 403) throw new Error('You do not have access to this file');
    if (!res.ok) throw new Error('The file could not be loaded');
    return URL.createObjectURL(await res.blob());
  },
};
