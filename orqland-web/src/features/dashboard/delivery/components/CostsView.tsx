'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { EmptyState, ErrorNote, Panel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { currentMonth, downloadCsv, formatDate, formatKm, formatMoney, formatPeriod, toCsv } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { EARNING_STATUS, metaOf } from '@/features/dashboard/common/utils/status';
import { useCostReport, useDeliveryAction, useDeliveryEarnings, useDeliveryStatements } from '../hooks/useDelivery';
import type { DeliveryEarning } from '../types/delivery.types';

const SOURCE: Record<string, string> = { ESTIMATED_ROUTE: 'Route estimate', GPS_TRACE: 'GPS trace', WORKSPACE_APPROVED: 'Approved by you' };

/**
 * Delivery cost reports and monthly statements (guide §9): earnings = approved billable km × the rate
 * snapshotted at acceptance. Approve, adjust (with reason), mark paid, export.
 */
export function CostsView({ orqspaceId }: { orqspaceId: string }) {
  const [period, setPeriod] = useState(currentMonth());
  const report = useCostReport(orqspaceId, period);
  const earnings = useDeliveryEarnings(orqspaceId, period);
  const statements = useDeliveryStatements(orqspaceId, period);
  const [approveFor, setApproveFor] = useState<DeliveryEarning | null>(null);
  const [adjustFor, setAdjustFor] = useState<DeliveryEarning | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const r = report.data;
  const payable = earnings.data?.filter((e) => e.status === 'APPROVED') ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField id="period" label="Reporting month" hint="Calendar month in the workspace timezone (1st to last day).">
          <Input type="month" value={period} max={currentMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-44" />
        </FormField>
        {r && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `delivery-costs-${period}.csv`,
                toCsv([
                  ['Delivery', 'Order', 'Agent', 'Delivered', 'Distance source', 'Billable km', 'Rate/km', 'Base', 'Adjustments', 'Amount', 'Status', 'Payout reference'],
                  ...(earnings.data ?? []).map((e) => [e.taskNumber, e.orderNumber, e.agentName, e.deliveredAt?.slice(0, 10), e.distanceSource, e.approvedBillableKm, e.ratePerKm, e.baseAmount, e.adjustmentTotal, e.finalAmount, e.status, e.payoutReference]),
                ]),
              )
            }
          >
            Export {formatPeriod(period)} CSV
          </Button>
        )}
      </div>

      {report.isError && <ErrorNote message={gqlErrorMessage(report.error)} onRetry={() => void report.refetch()} />}
      <MetricStrip>
        <Metric label="Agent deliveries" value={r?.deliveries ?? '—'} hint={r ? `${r.selfDeliveries} self · ${r.failedDeliveries} failed` : undefined} />
        <Metric label="Billable distance" value={r ? Number(r.billableKm).toFixed(1) : '—'} unit="km" />
        <Metric label="Delivery cost" value={r ? formatMoney(r.totalAmount) : '—'} />
        <Metric label="Pending approval" value={r ? formatMoney(r.pendingAmount) : '—'} state={r && Number(r.pendingAmount) > 0 ? 'warn' : undefined} />
        <Metric label="Approved, unpaid" value={r ? formatMoney(r.approvedAmount) : '—'} />
        <Metric label="Paid" value={r ? formatMoney(r.paidAmount) : '—'} />
      </MetricStrip>

      <Panel title="Monthly statements" description="One per agent. Drafts update as deliveries are approved; the month-end job freezes them as final.">
        {!statements.data ? (
          <Skeleton className="m-4 h-20" />
        ) : statements.data.length === 0 ? (
          <EmptyState title={`No statements for ${formatPeriod(period)}`} body="Statements are created when agents complete deliveries." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Agent</TH>
                <TH>Period</TH>
                <TH align="right">Deliveries</TH>
                <TH align="right">Km</TH>
                <TH align="right">Adjustments</TH>
                <TH align="right">Total</TH>
                <TH align="right">Outstanding</TH>
                <TH align="right">COD held</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {statements.data.map((s) => (
                <TR key={s.id}>
                  <TD>
                    {s.agentName} <span className="block font-mono text-[11px] text-muted-foreground">{s.agentOrqUserId}</span>
                  </TD>
                  <TD className="text-[12.5px]">
                    {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                  </TD>
                  <TD align="right">{s.deliveries}</TD>
                  <TD align="right">{Number(s.approvedKm).toFixed(1)}</TD>
                  <TD align="right">{formatMoney(s.adjustments)}</TD>
                  <TD align="right" className="font-medium">
                    {formatMoney(s.finalAmount)}
                  </TD>
                  <TD align="right">{formatMoney(s.outstandingAmount)}</TD>
                  <TD align="right">{formatMoney(Math.max(Number(s.codCollected) - Number(s.codSettled), 0))}</TD>
                  <TD>
                    <StatusDot tone={s.status === 'FINAL' ? 'good' : 'idle'} label={s.status === 'FINAL' ? 'Final' : 'Draft'} className="text-[12.5px]" />
                  </TD>
                  <TD align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        downloadCsv(
                          `statement-${s.agentOrqUserId}-${period}.csv`,
                          toCsv([
                            ['Delivery', 'Order', 'Delivered', 'Billable km', 'Rate/km', 'Base', 'Adjustments', 'Amount', 'Status'],
                            ...(earnings.data ?? [])
                              .filter((e) => e.agentUserId === s.agentUserId)
                              .map((e) => [e.taskNumber, e.orderNumber, e.deliveredAt?.slice(0, 10), e.approvedBillableKm, e.ratePerKm, e.baseAmount, e.adjustmentTotal, e.finalAmount, e.status]),
                            [],
                            ['Total', '', '', s.approvedKm, '', s.baseAmount, s.adjustments, s.finalAmount, s.status],
                          ]),
                        )
                      }
                    >
                      CSV
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Delivery earnings"
        description="Approve the billable distance before paying. Changes after approval need a reason and are audited."
        actions={
          payable.length > 0 && (
            <>
              <span className="text-[12px] text-muted-foreground">{selected.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => setSelected(selected.length === payable.length ? [] : payable.map((e) => e.id))}>
                {selected.length === payable.length ? 'Clear' : 'Select approved'}
              </Button>
              <Button size="sm" disabled={!selected.length} onClick={() => setPayOpen(true)}>
                Mark paid
              </Button>
            </>
          )
        }
      >
        {earnings.isError ? (
          <ErrorNote className="m-4" message={gqlErrorMessage(earnings.error)} />
        ) : !earnings.data ? (
          <Skeleton className="m-4 h-32" />
        ) : earnings.data.length === 0 ? (
          <EmptyState title={`No delivery earnings in ${formatPeriod(period)}`} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="w-8">
                  <span className="sr-only">Select</span>
                </TH>
                <TH>Delivery</TH>
                <TH>Agent</TH>
                <TH>Distance</TH>
                <TH align="right">Rate</TH>
                <TH align="right">Amount</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {earnings.data.map((e) => {
                const st = metaOf(EARNING_STATUS, e.status);
                return (
                  <TR key={e.id}>
                    <TD>
                      {e.status === 'APPROVED' && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.taskNumber}`}
                          className="size-4 accent-foreground"
                          checked={selected.includes(e.id)}
                          onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))}
                        />
                      )}
                    </TD>
                    <TD>
                      <p className="font-medium">{e.taskNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(e.deliveredAt)}</p>
                    </TD>
                    <TD>{e.agentName}</TD>
                    <TD className="text-[12.5px]">
                      <span className="tabular">{formatKm(e.approvedBillableKm)}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {SOURCE[e.distanceSource] ?? e.distanceSource}
                        {e.measuredDistanceKm ? ` · GPS ${formatKm(e.measuredDistanceKm)}` : ''}
                      </span>
                    </TD>
                    <TD align="right">{formatMoney(e.ratePerKm)}</TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(e.finalAmount)}
                      {Number(e.adjustmentTotal) !== 0 && <span className="block text-[11px] font-normal text-muted-foreground">adj {formatMoney(e.adjustmentTotal)}</span>}
                    </TD>
                    <TD>
                      <StatusDot tone={st.tone} label={st.label} className="text-[12.5px]" />
                      {e.payoutReference && <span className="block pl-3.5 font-mono text-[11px] text-muted-foreground">{e.payoutReference}</span>}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {['PENDING_APPROVAL', 'ESTIMATED'].includes(e.status) && (
                          <Button size="sm" onClick={() => setApproveFor(e)}>
                            Approve
                          </Button>
                        )}
                        {!['PAID', 'VOID'].includes(e.status) && (
                          <Button size="sm" variant="ghost" onClick={() => setAdjustFor(e)}>
                            Adjust
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      {approveFor && <ApproveDialog earning={approveFor} onClose={() => setApproveFor(null)} />}
      {adjustFor && <AdjustDialog earning={adjustFor} onClose={() => setAdjustFor(null)} />}
      {payOpen && <PayDialog orqspaceId={orqspaceId} earningIds={selected} total={payable.filter((e) => selected.includes(e.id)).reduce((s, e) => s + Number(e.finalAmount), 0)} onClose={(paid) => { setPayOpen(false); if (paid) setSelected([]); }} />}
    </div>
  );
}

const KM = /^\d{1,5}(\.\d{1,2})?$/;

function ApproveDialog({ earning: e, onClose }: { earning: DeliveryEarning; onClose: () => void }) {
  const action = useDeliveryAction('approveEarning');
  const schema = z
    .object({ approvedBillableKm: z.string().trim().regex(KM, 'Enter kilometres like 7.5'), reason: z.string().max(500).optional() })
    .superRefine((v, ctx) => {
      if (Number(v.approvedBillableKm) !== Number(e.approvedBillableKm) && (v.reason ?? '').trim().length < 3)
        ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required when you change the distance' });
    });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { approvedBillableKm: Number(e.approvedBillableKm).toFixed(2), reason: '' } });
  const km = Number(form.watch('approvedBillableKm')) || 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            action.mutate(
              { earningId: e.id, ...(Number(v.approvedBillableKm) !== Number(e.approvedBillableKm) ? { approvedBillableKm: v.approvedBillableKm, reason: v.reason } : {}) },
              { onSuccess: onClose },
            ),
          )}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Approve {e.taskNumber}</DialogTitle>
            <DialogDescription>
              Estimate {formatKm(e.estimatedDistanceKm)} · GPS {formatKm(e.measuredDistanceKm)} · rate {formatMoney(e.ratePerKm)}/km (fixed at acceptance).
            </DialogDescription>
          </DialogHeader>
          <FormField id="approveKm" label="Billable kilometres" error={form.formState.errors.approvedBillableKm?.message} hint={`Amount: ${formatMoney(km * Number(e.ratePerKm))}`}>
            <Input inputMode="decimal" {...form.register('approvedBillableKm')} />
          </FormField>
          <FormField id="approveReason" label="Reason" optional error={form.formState.errors.reason?.message}>
            <Textarea placeholder="Required if you change the distance" {...form.register('reason')} />
          </FormField>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ earning: e, onClose }: { earning: DeliveryEarning; onClose: () => void }) {
  const action = useDeliveryAction('adjustEarning');
  const schema = z.object({
    amount: z.string().trim().regex(/^-?\d{1,8}(\.\d{1,2})?$/, 'Enter an amount like 25 or -10').refine((v) => Number(v) !== 0, 'The adjustment cannot be zero'),
    reason: z.string().trim().min(3, 'Explain the adjustment — the agent sees it').max(500),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { amount: '', reason: '' } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => action.mutate({ earningId: e.id, ...v }, { onSuccess: onClose }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Adjust {e.taskNumber}</DialogTitle>
            <DialogDescription>Add a bonus (positive) or deduction (negative). The original amount stays on record.</DialogDescription>
          </DialogHeader>
          <FormField id="adjAmount" label="Adjustment (₹)" error={form.formState.errors.amount?.message}>
            <Input inputMode="decimal" {...form.register('amount')} />
          </FormField>
          <FormField id="adjReason" label="Reason" error={form.formState.errors.reason?.message}>
            <Textarea {...form.register('reason')} />
          </FormField>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Save adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ orqspaceId, earningIds, total, onClose }: { orqspaceId: string; earningIds: string[]; total: number; onClose: (paid: boolean) => void }) {
  const action = useDeliveryAction('markPaid');
  const schema = z.object({ payoutReference: z.string().trim().min(3, 'Enter the bank/UPI transfer reference').max(120) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { payoutReference: '' } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => action.mutate({ orqspaceId, earningIds, ...v }, { onSuccess: () => onClose(true) }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Mark {earningIds.length} earning{earningIds.length === 1 ? '' : 's'} paid</DialogTitle>
            <DialogDescription>Total {formatMoney(total)}. Payouts happen outside Orqland — record the reference of the transfer you made.</DialogDescription>
          </DialogHeader>
          <FormField id="payRef" label="Payout reference" error={form.formState.errors.payoutReference?.message}>
            <Input className="font-mono" {...form.register('payoutReference')} />
          </FormField>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Mark paid'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
