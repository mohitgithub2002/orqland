'use client';

import { FileImage } from 'lucide-react';
import { useState } from 'react';
import { deliveryFilesService } from '../services/delivery-files.service';

/** Opens an access-controlled delivery document (proof photo, attachment) in a new tab. */
export function ProtectedFileLink({ fileId, label }: { fileId: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="inline-flex items-center gap-1 text-[12.5px] underline underline-offset-2 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const tab = window.open('', '_blank');
          try {
            const url = await deliveryFilesService.objectUrl(fileId);
            if (tab) tab.location.href = url;
            else window.location.assign(url);
          } catch (e) {
            tab?.close();
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileImage className="size-3.5" /> {label}
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
