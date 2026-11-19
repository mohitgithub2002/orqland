'use client';

import { ShoppingBag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import '@/styles/ops-theme.css';
import { EmptyState } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { formatDateTime, formatMoney } from '@/features/dashboard/common/utils/format';
import { metaOf, ORDER_STATUS } from '@/features/dashboard/common/utils/status';
import { useMyOrders } from '../hooks/useMyOrders';
import { MyOrderDetail } from './MyOrderDetail';

/** Buyer's order history (account centre → My Activity / My Orders). */
export function MyOrdersPage() {
  const params = useSearchParams();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get('order'));
  const { data } = useMyOrders(page);

  return (
    <div className="ops-theme mx-auto w-full max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
      {!data && <Skeleton className="h-48 w-full" />}
      {data?.items.length === 0 && <EmptyState icon={ShoppingBag} title="No orders yet" body="Orders you place on Orqland appear here." />}
      <div className="space-y-2">
        {data?.items.map((o) => (
          <button key={o.id} onClick={() => setOpenId(o.id)} className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-foreground/40">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{o.orqspaceName}</span>
              <StatusDot tone={metaOf(ORDER_STATUS, o.orderStatus).tone} label={metaOf(ORDER_STATUS, o.orderStatus).label} className="text-[12.5px]" />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</p>
            <p className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {o.orderNumber} · {formatDateTime(o.createdAt)}
              </span>
              <span className="font-medium text-foreground">{formatMoney(o.totalAmount)}</span>
            </p>
          </button>
        ))}
      </div>
      {data && data.total > page * 20 && (
        <Button variant="outline" className="w-full" onClick={() => setPage((p) => p + 1)}>
          Older orders
        </Button>
      )}
      <MyOrderDetail orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
