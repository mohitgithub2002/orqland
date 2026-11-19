// [HOST SHIM] Harness-only user/workspace switcher — do not copy.
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useActiveOrqspaceStore } from '@/features/dashboard/common/hooks/useActiveOrqspaceId';
import { DEV_USER_KEY } from '@/lib/graphqlClient';

const USERS = [
  { id: '00000000-0000-4000-8000-000000000001', label: 'Shaju (workspace owner)' },
  { id: '00000000-0000-4000-8000-000000000003', label: 'Ravi (agent)' },
  { id: '00000000-0000-4000-8000-000000000004', label: 'Priya (agent)' },
  { id: '00000000-0000-4000-8000-000000000002', label: 'Maria (customer)' },
];
const SEED_ORQSPACE = '00000000-0000-4000-8000-0000000000a1';

export function DevSwitcher() {
  const queryClient = useQueryClient();
  const setOrqspaceId = useActiveOrqspaceStore((s) => s.setOrqspaceId);
  const [user, setUser] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem(DEV_USER_KEY) ?? USERS[0].id;
    localStorage.setItem(DEV_USER_KEY, stored);
    setUser(stored);
    setOrqspaceId(SEED_ORQSPACE);
  }, [setOrqspaceId]);

  return (
    <select
      aria-label="Dev user"
      className="h-8 max-w-[160px] rounded-md border border-dashed border-warning bg-card px-2 text-xs"
      value={user}
      onChange={(e) => {
        localStorage.setItem(DEV_USER_KEY, e.target.value);
        setUser(e.target.value);
        void queryClient.invalidateQueries();
      }}
    >
      {USERS.map((u) => (
        <option key={u.id} value={u.id}>
          Dev: {u.label}
        </option>
      ))}
    </select>
  );
}
