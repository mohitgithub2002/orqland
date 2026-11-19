'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Textarea } from '@/components/ui/textarea';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { formatDateTime, humanize } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TICKET_STATUS } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useRunAction, useSupportTicket } from '../hooks/useRun';
import { TICKET_CATEGORIES, type TicketCategory } from '../types/run.types';
import { PhotoCapture, type CapturedFile } from './RunPrimitives';

export interface TicketPreset {
  category?: TicketCategory;
  subject?: string;
  relatedTaskId?: string;
  relatedEarningId?: string;
  relatedConnectionId?: string;
  relatedPeriodMonth?: string;
  description?: string;
}

const schema = z.object({
  category: z.enum(['DELIVERY', 'EARNINGS_PAYMENT', 'KYC', 'WORKSPACE', 'TECHNICAL', 'ACCOUNT_SECURITY', 'EMERGENCY']),
  subject: z.string().trim().min(4, 'Add a short subject').max(160),
  description: z.string().trim().min(10, 'Describe what happened (at least 10 characters)').max(4000),
});

/** Raise a ticket (category, description, optional photo/PDF attachments). Used from Help, deliveries, earnings. */
export function NewTicketDialog({ onClose, preset }: { onClose: () => void; preset?: TicketPreset }) {
  const create = useRunAction('createTicket');
  const [files, setFiles] = useState<CapturedFile[]>([]);
  const [slot, setSlot] = useState<CapturedFile | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { category: preset?.category ?? 'DELIVERY', subject: preset?.subject ?? '', description: preset?.description ?? '' },
  });
  const category = form.watch('category');
  const hint = TICKET_CATEGORIES.find((c) => c.value === category)?.hint;
  const linked = preset?.relatedTaskId ? 'this delivery' : preset?.relatedEarningId ? 'this earning — it is held for review' : preset?.relatedPeriodMonth ? `the ${preset.relatedPeriodMonth} statement` : null;
  const e = form.formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            create.mutate(
              {
                ...v,
                relatedTaskId: preset?.relatedTaskId,
                relatedEarningId: preset?.relatedEarningId,
                relatedConnectionId: preset?.relatedConnectionId,
                relatedPeriodMonth: preset?.relatedPeriodMonth,
                attachmentFileIds: files.length ? files.map((f) => f.id) : undefined,
              },
              { onSuccess: onClose },
            ),
          )}
        >
          <DialogHeader>
            <DialogTitle>{category === 'EMERGENCY' ? 'Report an emergency' : 'Contact support'}</DialogTitle>
            <DialogDescription>{linked ? `Linked to ${linked}.` : 'Support replies in this ticket and notifies you.'}</DialogDescription>
          </DialogHeader>
          {category === 'EMERGENCY' && <p className="rounded-lg border-2 border-destructive px-3 py-2 text-[13px] font-medium">If anyone is in danger, call 112 now. This ticket is marked urgent.</p>}
          <FormField id="t-cat" label="Topic" hint={hint}>
            <Select disabled={!!preset?.relatedEarningId} {...form.register('category')}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="t-subject" label="Subject" error={e.subject?.message}>
            <Input maxLength={160} {...form.register('subject')} />
          </FormField>
          <FormField id="t-desc" label="What happened?" error={e.description?.message}>
            <Textarea rows={5} maxLength={4000} {...form.register('description')} />
          </FormField>
          <div className="space-y-2">
            {files.map((f) => (
              <p key={f.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[12.5px]">
                <span className="truncate">{f.name}</span>
                <button type="button" className="underline" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>
                  Remove
                </button>
              </p>
            ))}
            {files.length < 5 && (
              <PhotoCapture
                purpose="SUPPORT_ATTACHMENT"
                label="Attachment"
                optional
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hint="Photo or PDF · up to 5 files"
                value={slot}
                onChange={(f) => {
                  if (f) setFiles([...files, f]);
                  setSlot(null);
                }}
              />
            )}
          </div>
          {create.error && <ErrorNote message={gqlErrorMessage(create.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={category === 'EMERGENCY' ? 'destructive' : 'default'} disabled={create.isPending}>
              {create.isPending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const replySchema = z.object({ body: z.string().trim().min(1, 'Write a reply').max(4000) });

export function TicketConversation({ ticketId }: { ticketId: string }) {
  const { data: t, error } = useSupportTicket(ticketId);
  const reply = useRunAction('replyTicket');
  const close = useRunAction('closeTicket');
  const [files, setFiles] = useState<CapturedFile[]>([]);
  const form = useForm<z.infer<typeof replySchema>>({ resolver: zodResolver(replySchema), defaultValues: { body: '' } });
  if (error) return <ErrorNote className="m-5" message={gqlErrorMessage(error)} />;
  if (!t) return <Skeleton className="m-5 h-64" />;
  const closed = t.status === 'CLOSED';
  const st = metaOf(TICKET_STATUS, t.status);
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b border-border p-5 pr-12">
        <SheetTitle className="text-base">{t.subject}</SheetTitle>
        <p className="text-[12px] text-muted-foreground">
          <span className="font-mono">{t.ticketNumber}</span> · {humanize(t.category)} · {humanize(t.priority)} priority{t.assignedTeam ? ` · ${t.assignedTeam}` : ''}
          {t.relatedTaskNumber && ` · ${t.relatedTaskNumber}`}
        </p>
        <StatusDot tone={st.tone} label={st.label} className="text-[12.5px]" />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <Bubble mine author="You" body={t.description} at={t.createdAt} />
        {t.messages?.map((m) => (
          <Bubble key={m.id} mine={m.authorRole === 'AGENT'} author={m.authorRole === 'AGENT' ? 'You' : (m.authorName ?? 'Support')} body={m.body} at={m.createdAt} links={m.attachmentUrls} fileIds={m.attachmentFileIds} />
        ))}
      </div>
      <div className="space-y-2 border-t border-border p-4">
        {reply.error && <ErrorNote message={gqlErrorMessage(reply.error)} />}
        {!closed ? (
          <form
            noValidate
            onSubmit={form.handleSubmit((v) =>
              reply.mutate(
                { ticketId, body: v.body, attachmentFileIds: files.length ? files.map((f) => f.id) : undefined },
                {
                  onSuccess: () => {
                    form.reset();
                    setFiles([]);
                  },
                },
              ),
            )}
            className="space-y-2"
          >
            <div className="flex gap-2">
              <Textarea rows={2} aria-label="Reply" placeholder="Write a reply" aria-invalid={form.formState.errors.body ? true : undefined} {...form.register('body')} />
              <Button type="submit" size="icon" aria-label="Send reply" disabled={reply.isPending}>
                <Send />
              </Button>
            </div>
            {files.length > 0 && <p className="text-[12px] text-muted-foreground">{files.length} attachment(s) ready</p>}
            <PhotoCapture purpose="SUPPORT_ATTACHMENT" label="Add attachment" optional accept="image/jpeg,image/png,image/webp,application/pdf" value={null} onChange={(f) => f && setFiles([...files, f])} />
            <button type="button" className="text-[12px] text-muted-foreground underline underline-offset-2" onClick={() => close.mutate(ticketId)}>
              My issue is solved — close the ticket
            </button>
          </form>
        ) : (
          <p className="text-center text-[12px] text-muted-foreground">Ticket closed {formatDateTime(t.resolvedAt)}</p>
        )}
      </div>
    </div>
  );
}

function Bubble({ mine, author, body, at, links, fileIds }: { mine: boolean; author: string; body: string; at: string; links?: string[]; fileIds?: string[] }) {
  return (
    <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[13px]', mine ? 'ml-auto bg-foreground text-background' : 'bg-muted')}>
      <p className="whitespace-pre-wrap">{body}</p>
      {links?.map((l) => (
        <a key={l} href={l} target="_blank" rel="noreferrer" className="block truncate text-[12px] underline opacity-80">
          {l}
        </a>
      ))}
      {fileIds?.map((id, i) => (
        <span key={id} className="block">
          <ProtectedFileLink fileId={id} label={`Attachment ${i + 1}`} />
        </span>
      ))}
      <p className="mt-1 text-[10.5px] opacity-60">
        {author} · {formatDateTime(at)}
      </p>
    </div>
  );
}
