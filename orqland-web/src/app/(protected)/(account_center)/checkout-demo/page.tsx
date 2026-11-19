// [HOST SHIM] Harness-only stand-in for your listing/cart page — do not copy.
// In the main app, open <CheckoutSheet lines={cartLines} /> from the listing page's "Buy" / cart button.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckoutSheet } from '@/features/myOrders/components/CheckoutSheet';
import type { CartLine } from '@/features/myOrders/types/my-orders.types';

const DEMO_CART: CartLine[] = [
  { listingId: '00000000-0000-4000-8000-0000000000c1', variantId: '00000000-0000-4000-8000-0000000000d1', quantity: 2, title: 'Filter Coffee Pack', variantLabel: '250 g', unitTotalPrice: '210.00', orqspaceName: 'Sj softwares' },
  { listingId: '00000000-0000-4000-8000-0000000000c2', quantity: 1, title: 'Brass Dabara Set', unitTotalPrice: '504.00', orqspaceName: 'Sj softwares' },
];

export default function CheckoutDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Cart (demo)</h1>
      {DEMO_CART.map((l) => (
        <p key={l.listingId} className="text-sm">
          {l.quantity}× {l.title} {l.variantLabel && `· ${l.variantLabel}`}
        </p>
      ))}
      <Button onClick={() => setOpen(true)}>Checkout</Button>
      <CheckoutSheet open={open} onOpenChange={setOpen} lines={DEMO_CART} />
    </div>
  );
}
