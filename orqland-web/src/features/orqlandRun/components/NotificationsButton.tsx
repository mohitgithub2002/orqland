'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { timeAgo } from '@/features/dashboard/common/utils/format';
import { cn } from '@/lib/utils';
import { useRunAction, useRunNotifications } from '../hooks/useRun';

/** Bell with unread count + notification history (read/unread). Works for agents and workspace admins. */
export function NotificationsButton() {
  const { data } = useRunNotifications();
  const markRead = useRunAction('markNotificationsRead');
  const [open, setOpen] = useState(false);
  const unread = data?.unreadCount ?? 0;

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={() => setOpen(true)}>
        <Bell />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="ops-theme max-w-md">
          <div className="flex items-center justify-between border-b border-border p-5 pr-12">
            <SheetTitle className="text-base">Notifications</SheetTitle>
            {unread > 0 && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => markRead.mutate([])}>
                Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {data?.items.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nothing yet.</p>}
            {data?.items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.readAt && markRead.mutate([n.id])}
                className={cn('flex w-full gap-3 px-5 py-3 text-left', !n.readAt && 'bg-muted/50')}
              >
                <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-foreground')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {!n.readAt && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
