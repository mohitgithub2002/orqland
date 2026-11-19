'use client';

import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { deliveryFilesService, MAX_UPLOAD_BYTES } from '@/features/dashboard/common/services/delivery-files.service';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useAttachInvoice } from '../../hooks/useOrders';
import type { Order } from '../../types/order.types';
import { ActionButton, InlineError, SectionLabel } from './parts';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Browse → Upload. The invoice is stored as an access-controlled file the customer can download. */
export function InvoiceUpload({ order }: { order: Order }) {
  const attach = useAttachInvoice();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_UPLOAD_BYTES) return setError('Files must be 8 MB or smaller');
    setFile(f);
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await deliveryFilesService.upload(file, 'ORDER_INVOICE');
      await attach.mutateAsync({ orderId: order.id, fileId: uploaded.id });
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (e) {
      setError(gqlErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionLabel>Invoice</SectionLabel>
      {order.invoice && !file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-100 px-3 py-2">
          <ProtectedFileLink fileId={order.invoice.id} label={order.invoice.originalName ?? 'View invoice'} />
          <button type="button" className="text-[12px] text-gray-600 underline underline-offset-2 hover:text-gray-950" onClick={() => input.current?.click()}>
            Replace
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 text-left text-[12.5px] text-gray-600 hover:border-gray-500 focus-visible:outline-2 focus-visible:outline-gray-900"
          >
            <FileUp aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{file ? file.name : 'Browse · PDF or image, up to 8 MB'}</span>
          </button>
          <ActionButton disabled={!file || busy} onClick={() => void upload()}>
            {busy ? 'Uploading…' : 'Upload'}
          </ActionButton>
        </div>
      )}
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Invoice file" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      <InlineError message={error} />
    </div>
  );
}
