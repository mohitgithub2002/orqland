import { Suspense } from 'react';
import { OrdersPage } from '@/features/dashboard/orders/components/OrdersPage';

export const metadata = { title: 'Orders · Orqland' };

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
