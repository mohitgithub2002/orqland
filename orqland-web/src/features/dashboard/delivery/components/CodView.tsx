'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { EmptyState, ErrorNote, Panel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { UnderlineTabs } from '@/components/ui/underline-tabs';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { downloadCsv, formatDateTime, formatMoney, toCsv } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { COD_STATUS, metaOf } from '@/features/dashboard/common/utils/status';
import { useCodRecords, useCodSummary, useDeliveryAction } from '../hooks/useDelivery';
import type { CodRecord, CodStatus } from '../types/delivery.types';

const FILTERS: { key: string; label: string; statuses?: CodStatus[] }[] = [
  { key: 'open', label: 'To reconcile', statuses: ['COLLECTED', 'PARTIALLY_SETTLED', 'DISCREPANCY', 'UNDER_REVIEW'] },
  { key: 'pending', label: 'Not yet collected', statuses: ['PENDING_COLLECTION'] },
  { key: 'closed', label: 'Settled', statuses: ['SETTLED', 'NOT_COLLECTED'] },
  { key: 'all', label: 'All' },
];
const METHOD: Record<string, string> = { CASH: 'Cash', UPI_TO_SELLER: 'UPI to seller', OTHER: 'Other' };

/**
 * COD reconciliation (guide §8): COD is tracked separately from delivery status. An order is only
 * marked paid once the cash handed over by the agent is settled here.
 */
export function CodView({ orqspaceId }: { orqspaceId: string }) {
  const [filter, setFilter] = useState('open');
  const statuses = FILTERS.find((f) => f.key === filter)?.statuses;
  const summary = useCodSummary(orqspaceId);
  const records = useCodRecords(orqspaceId, statuses);
  const [settleFor, setSettleFor] = useState<CodRecord | null>(null);
  const [resolveFor, setResolveFor] = useState<CodRecord | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const s = summary.data;

  return (
    <div className="space-y-5">
      <MetricStrip>
        <Metric label="Expected" value={s ? formatMoney(s.expected) : '—'} hint="all COD deliveries" />
        <Metric label="Collected by agents" value={s ? formatMoney(s.collected) : '—'} />
        <Metric label="Handed over" value={s ? formatMoney(s.settled) : '—'} />
        <Metric label="Outstanding" value={s ? formatMoney(s.outstanding) : '—'} hint={s ? `${s.openRecords} open records` : undefined} state={s && Number(s.outstanding) > 0 ? 'warn' : undefined} />
        <Metric label="Discrepancies" value={s?.discrepancies ?? '—'} state={s?.discrepancies ? 'bad' : undefined} hint="collected ≠ expected" />
      </MetricStrip>

      <Panel
        title="Cash on delivery"
        description="Record each cash handover. Orders become paid only when fully settled."
        actions={
          records.data?.length ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `cod-${filter}.csv`,
                  toCsv([
                    ['Delivery', 'Order', 'Agent', 'Expected', 'Collected', 'Method', 'Settled', 'Outstanding', 'Status', 'Collected at'],
                    ...records.data!.map((r) => [r.taskNumber, r.orderNumber, r.agentName, r.expectedAmount, r.collectedAmount, r.collectionMethod, r.settledAmount, r.outstandingAmount, r.status, r.collectedAt]),
                  ]),
                )
              }
            >
              Export CSV
            </Button>
          ) : null
        }
      >
        <UnderlineTabs label="COD filter" className="px-4" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ key: f.key, label: f.label }))} />
        {records.isError ? (
          <ErrorNote className="m-4" message={gqlErrorMessage(records.error)} onRetry={() => void records.refetch()} />
        ) : !records.data ? (
          <Skeleton className="m-4 h-32" />
        ) : records.data.length === 0 ? (
          <EmptyState title="Nothing here" body="COD deliveries appear once dispatched." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Delivery</TH>
                <TH>Agent</TH>
                <TH align="right">Expected</TH>
                <TH align="right">Collected</TH>
                <TH align="right">Settled</TH>
                <TH align="right">Outstanding</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {records.data.map((r) => {
                const st = metaOf(COD_STATUS, r.status);
                const canSettle = ['COLLECTED', 'PARTIALLY_SETTLED', 'DISCREPANCY', 'UNDER_REVIEW'].includes(r.status) && Number(r.outstandingAmount) > 0;
                const canResolve = ['DISCREPANCY', 'UNDER_REVIEW'].includes(r.status);
                return (
                  <Fragment key={r.id}>
                    <TR interactive onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                      <TD>
                        <p className="font-medium">{r.taskNumber}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{r.orderNumber}</p>
                      </TD>
                      <TD>{r.agentName ?? 'Own staff'}</TD>
                      <TD align="right">{formatMoney(r.expectedAmount)}</TD>
                      <TD align="right">
                        {formatMoney(r.collectedAmount)}
                        {r.collectionMethod && <span className="block text-[11px] text-muted-foreground">{METHOD[r.collectionMethod]}</span>}
                      </TD>
                      <TD align="right">{formatMoney(r.settledAmount)}</TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(r.outstandingAmount)}
                      </TD>
                      <TD>
                        <StatusDot tone={st.tone} label={st.label} className="text-[12.5px]" />
                      </TD>
                      <TD align="right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          {canSettle && (
                            <Button size="sm" onClick={() => setSettleFor(r)}>
                              Record handover
                            </Button>
                          )}
                          {canResolve && (
                            <Button size="sm" variant="outline" onClick={() => setResolveFor(r)}>
                              Resolve
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                    {open === r.id && (
                      <tr className="border-b border-border bg-muted/40">
                        <td colSpan={8} className="px-4 py-3 text-[12.5px]">
                          <div className="flex flex-wrap gap-x-8 gap-y-2">
                            <span>Collected {formatDateTime(r.collectedAt)}</span>
                            {r.discrepancyReason && <span>Note: {r.discrepancyReason}</span>}
                            {r.collectionProofFileId && <ProtectedFileLink fileId={r.collectionProofFileId} label="Payment proof" />}
                          </div>
                          {r.settlements.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {r.settlements.map((x) => (
                                <li key={x.id} className="tabular">
                                  {formatDateTime(x.createdAt)} · {formatMoney(x.amount)} · {METHOD[x.method]} · {x.recordedByName ?? '—'}
                                  {x.note && <span className="text-muted-foreground"> · {x.note}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      {settleFor && <SettleDialog record={settleFor} onClose={() => setSettleFor(null)} />}
      {resolveFor && <ResolveDialog record={resolveFor} onClose={() => setResolveFor(null)} />}
    </div>
  );
}

function SettleDialog({ record: r, onClose }: { record: CodRecord; onClose: () => void }) {
  const action = useDeliveryAction('recordSettlement');
  const schema = z.object({
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 420 or 420.50')
      .refine((v) => Number(v) > 0, 'Enter more than ₹0')
      .refine((v) => Number(v) <= Number(r.outstandingAmount), `At most ${formatMoney(r.outstandingAmount)} is outstanding`),
    method: z.enum(['CASH', 'UPI_TO_SELLER', 'OTHER']),
    note: z.string().max(500).optional(),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { amount: r.outstandingAmount, method: 'CASH', note: '' } });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => action.mutate({ codRecordId: r.id, amount: v.amount, method: v.method, note: v.note || undefined }, { onSuccess: onClose }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Record handover · {r.taskNumber}</DialogTitle>
            <DialogDescription>
              {r.agentName ?? 'Staff'} collected {formatMoney(r.collectedAmount)}; {formatMoney(r.outstandingAmount)} is still outstanding.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="settleAmount" label="Amount received (₹)" error={e.amount?.message}>
              <Input inputMode="decimal" {...form.register('amount')} />
            </FormField>
            <FormField id="settleMethod" label="Received via">
              <Select {...form.register('method')}>
                <option value="CASH">Cash</option>
                <option value="UPI_TO_SELLER">UPI to seller</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
          </div>
          <FormField id="settleNote" label="Note" optional>
            <Textarea {...form.register('note')} />
          </FormField>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Record handover'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ record: r, onClose }: { record: CodRecord; onClose: () => void }) {
  const action = useDeliveryAction('resolveCod');
  const schema = z.object({
    resolution: z.enum(['ACCEPT_AS_SETTLED', 'MARK_NOT_COLLECTED', 'KEEP_UNDER_REVIEW']),
    reason: z.string().trim().min(3, 'Explain the decision (kept in the audit log)').max(500),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { resolution: 'KEEP_UNDER_REVIEW', reason: '' } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => action.mutate({ codRecordId: r.id, ...v }, { onSuccess: onClose }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Resolve discrepancy · {r.taskNumber}</DialogTitle>
            <DialogDescription>{r.discrepancyReason ?? `Expected ${formatMoney(r.expectedAmount)}, collected ${formatMoney(r.collectedAmount)}.`}</DialogDescription>
          </DialogHeader>
          <FormField id="resolution" label="Decision">
            <Select {...form.register('resolution')}>
              <option value="KEEP_UNDER_REVIEW">Keep under review</option>
              <option value="ACCEPT_AS_SETTLED">Accept as settled</option>
              <option value="MARK_NOT_COLLECTED">Mark as not collected</option>
            </Select>
          </FormField>
          <FormField id="resolveReason" label="Reason" error={form.formState.errors.reason?.message}>
            <Textarea {...form.register('reason')} />
          </FormField>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Save decision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
