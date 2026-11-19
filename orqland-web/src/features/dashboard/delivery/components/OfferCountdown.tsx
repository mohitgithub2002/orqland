'use client';

import { useEffect, useState } from 'react';

export function OfferCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return (
    <span className={className ?? 'text-xs tabular-nums text-muted-foreground'}>
      {seconds > 0 ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Expired — moving on'}
    </span>
  );
}
