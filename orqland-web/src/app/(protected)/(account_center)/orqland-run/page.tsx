import { Suspense } from 'react';
import { OrqlandRunPage } from '@/features/orqlandRun/components/OrqlandRunPage';

export const metadata = { title: 'Orqland Run' };

export default function Page() {
  return (
    <Suspense>
      <OrqlandRunPage />
    </Suspense>
  );
}
