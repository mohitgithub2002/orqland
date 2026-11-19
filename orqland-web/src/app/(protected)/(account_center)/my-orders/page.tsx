import { Suspense } from 'react';
import { MyOrdersPage } from '@/features/myOrders/components/MyOrdersPage';

export const metadata = { title: 'My orders · Orqland' };

export default function Page() {
  return (
    <Suspense>
      <MyOrdersPage />
    </Suspense>
  );
}
