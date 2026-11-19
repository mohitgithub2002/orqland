'use client';

import { ChevronDown, PhoneCall, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorNote } from '@/components/ui/panel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { humanize, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TICKET_STATUS } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useRunAction, useRunNotifications, useSupportTickets } from '../hooks/useRun';
import { RunCard } from './RunPrimitives';
import type { RunViewProps } from './RunShell';
import { NewTicketDialog, TicketConversation } from './SupportTickets';

const FAQ = [
  { q: 'Why am I not receiving deliveries?', a: 'You must be online, have valid verification, and be connected to at least one workspace. Workspaces only send their own deliveries to their connected agents.' },
  { q: 'How are my earnings calculated?', a: 'Approved billable kilometres × the per-km rate agreed with that workspace, fixed when you accepted the delivery. The workspace approves the kilometres before paying.' },
  { q: 'What if the customer is not available?', a: 'Call the customer from the active job. If you still cannot deliver, tap “Can’t deliver”, choose the reason, and bring the parcel back if the workspace asks.' },
  { q: 'When do I need to re-verify?', a: 'Your driving licence every 12 months and your vehicle every 4 months. You get reminders 15 days before; new offers stop if verification lapses.' },
  { q: 'What happens to cash I collect?', a: 'Enter the exact amount when completing the delivery and hand it over to the workspace. The workspace confirms each handover — the order is marked paid only then.' },
  { q: 'When is my location shared?', a: 'Only while you are online or carrying a delivery, and only with the workspace of that delivery. Location history is deleted after 90 days.' },
];

/** Screen 6 — Notifications & Support: history with read state, tickets with attachments, FAQ, emergency guidance. */
export function HelpView(_: RunViewProps) {
  const tickets = useSupportTickets();
  const notifications = useRunNotifications();
  const markRead = useRunAction('markNotificationsRead');
  const [newOpen, setNewOpen] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <RunCard className="space-y-3 border-2 border-destructive/50">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <PhoneCall className="size-4" /> Emergency or accident?
        </p>
        <p className="text-[13px] text-muted-foreground">Get to safety first and call 112. Then tell us, so we can inform the workspace and help with the delivery.</p>
        <div className="grid grid-cols-2 gap-2">
          <a href="tel:112" className="inline-flex h-12 items-center justify-center rounded-xl bg-destructive text-[14px] font-semibold text-white">
            Call 112
          </a>
          <button type="button" onClick={() => setEmergency(true)} className="h-12 rounded-xl border border-border text-[14px] font-semibold">
            Report incident
          </button>
        </div>
      </RunCard>

      <RunCard className="p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Notifications{unread ? ` · ${unread} unread` : ''}</p>
          {unread > 0 && (
            <button type="button" className="text-[12px] underline underline-offset-2" onClick={() => markRead.mutate([])}>
              Mark all read
            </button>
          )}
        </div>
        {notifications.isError ? (
          <ErrorNote className="m-4" message={gqlErrorMessage(notifications.error)} />
        ) : !notifications.data ? (
          <Skeleton className="m-4 h-24" />
        ) : notifications.data.items.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.data.items.slice(0, 15).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => !n.readAt && markRead.mutate([n.id])} className={cn('flex w-full gap-3 px-4 py-3 text-left', !n.readAt && 'bg-muted/60')}>
                  <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-foreground')} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {!n.readAt && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">{n.body}</span>
                    <span className="block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </RunCard>

      <RunCard className="p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Support tickets</p>
          <button type="button" onClick={() => setNewOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-[12.5px] font-medium">
            <Plus className="size-4" /> New ticket
          </button>
        </div>
        {!tickets.data ? (
          <Skeleton className="m-4 h-20" />
        ) : tickets.data.length === 0 ? (
          <EmptyState title="No tickets" body="Delivery, earnings, verification, workspace, technical or account issues — we reply here." />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {tickets.data.map((t) => {
              const st = metaOf(TICKET_STATUS, t.status);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenId(t.id)} className="w-full px-4 py-3 text-left hover:bg-muted/60">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{t.subject}</span>
                      <StatusDot tone={st.tone} label={st.label} className="shrink-0 text-[11.5px]" />
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                      <span className="font-mono">{t.ticketNumber}</span> · {humanize(t.category)} · {humanize(t.priority)} · updated {timeAgo(t.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </RunCard>

      <RunCard className="p-0">
        <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Frequently asked</p>
        <div className="divide-y divide-border">
          {FAQ.map((f) => (
            <FaqItem key={f.q} {...f} />
          ))}
        </div>
      </RunCard>
      <p className="text-center text-[12px] text-muted-foreground">Support hours 8am–10pm · Emergency tickets are handled 24×7</p>

      {newOpen && <NewTicketDialog onClose={() => setNewOpen(false)} />}
      {emergency && <NewTicketDialog onClose={() => setEmergency(false)} preset={{ category: 'EMERGENCY', subject: 'Emergency / accident' }} />}
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="ops-theme max-w-md">{openId && <TicketConversation ticketId={openId} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-3">
      <button type="button" aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left text-[13px] font-medium" onClick={() => setOpen((v) => !v)}>
        {q}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="mt-2 text-[13px] text-muted-foreground">{a}</p>}
    </div>
  );
}
