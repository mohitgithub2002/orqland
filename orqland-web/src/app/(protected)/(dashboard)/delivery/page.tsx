import { Suspense } from 'react';
import { DeliveryPage } from '@/features/dashboard/delivery/components/DeliveryPage';

export const metadata = { title: 'Delivery · Orqland' };

export default function Page() {
  return (
    <Suspense>
      <DeliveryPage />
    </Suspense>
  );
}
