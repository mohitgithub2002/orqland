'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Integration point: the workspace currently open in the dashboard.
 * On merge, replace the body of `useActiveOrqspaceId` with your existing workspace store/context
 * (the header shows "WSID: …" — the value needed here is the orqspaces.id UUID).
 */
interface ActiveOrqspaceState {
  orqspaceId: string | null;
  setOrqspaceId: (id: string | null) => void;
}

export const useActiveOrqspaceStore = create<ActiveOrqspaceState>()(
  persist((set) => ({ orqspaceId: null, setOrqspaceId: (orqspaceId) => set({ orqspaceId }) }), { name: 'orq.activeOrqspace' }),
);

export function useActiveOrqspaceId(): string | null {
  return useActiveOrqspaceStore((s) => s.orqspaceId);
}
