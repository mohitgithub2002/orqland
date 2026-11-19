'use client';

import { Camera, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { deliveryFilesService, type DeliveryFilePurpose } from '@/features/dashboard/common/services/delivery-files.service';
import { cn } from '@/lib/utils';
import type { CapturedFile } from './RunPrimitives';

const MAX_EDGE = 1600;

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not be started.';
}

/**
 * Live camera capture → upload. There is deliberately no file picker: the proof photo must be taken
 * at the door. (The engine also rejects photos uploaded before the parcel was picked up.)
 */
export function CameraCapture({
  purpose,
  label,
  hint,
  value,
  onChange,
  error,
  optional,
}: {
  purpose: DeliveryFilePurpose;
  label: string;
  hint?: string;
  value: CapturedFile | null;
  onChange: (file: CapturedFile | null) => void;
  error?: string;
  optional?: boolean;
}) {
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? error;
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setProblem(null);
    if (!supported) {
      setProblem(typeof window !== 'undefined' && !window.isSecureContext ? 'The camera needs a secure (https) connection.' : 'This browser cannot open the camera. Use Orqland Run on your phone.');
      return;
    }
    setStarting(true);
    setOpen(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play().catch(() => undefined);
      }
    } catch (e) {
      setProblem(cameraError(e));
      setOpen(false);
      stop();
    } finally {
      setStarting(false);
    }
  };

  const close = () => {
    stop();
    setOpen(false);
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return setProblem('The photo could not be captured. Try again.');
    close();
    setBusy(true);
    setProblem(null);
    try {
      const name = `proof-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      const uploaded = await deliveryFilesService.upload(new File([blob], name, { type: 'image/jpeg' }), purpose);
      onChange({ id: uploaded.id, name, previewUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[12px] font-medium">
        <span id={`${id}-label`}>{label}</span>
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value.previewUrl && <img src={value.previewUrl} alt="Proof photo" className="size-14 rounded-lg object-cover" />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[13px] font-medium">
              <Check className="size-4" /> Photo taken
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">Uploaded securely</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="rounded-md p-2 hover:bg-muted" aria-label="Retake photo">
            <RefreshCw className="size-4" />
          </button>
        </div>
      ) : open ? (
        <div className="overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted autoPlay aria-label="Camera viewfinder" className="aspect-[3/4] max-h-[40dvh] w-full object-cover" />
          <div className="flex items-center justify-between gap-3 p-3">
            <button type="button" onClick={close} className="flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-white hover:bg-white/10">
              <X className="size-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={() => void shoot()}
              disabled={starting}
              aria-label="Take photo"
              className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
            >
              {starting ? <Loader2 className="size-6 animate-spin text-white" /> : <span className="size-11 rounded-full bg-white" />}
            </button>
            <span className="w-[88px]" aria-hidden />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          aria-label={busy ? `Uploading ${label}` : `Open camera: ${label}`}
          aria-describedby={message ? `${id}-error` : undefined}
          className={cn(
            'flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-dashed px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-foreground',
            message ? 'border-destructive' : 'border-input',
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          <span className="text-[13px]">
            <span className="block font-medium">{busy ? 'Uploading…' : 'Open camera'}</span>
            <span className="block text-[11.5px] text-muted-foreground">{hint ?? 'Take the photo now — gallery uploads are not accepted'}</span>
          </span>
        </button>
      )}
      {message && (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
