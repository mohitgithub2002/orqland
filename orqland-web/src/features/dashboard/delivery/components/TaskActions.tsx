'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useDeliveryAction } from '../hooks/useDelivery';
import { PRE_PICKUP, type DeliveryTask } from '../types/delivery.types';
import { DispatchDialog } from './DispatchDialog';

type ReasonKind = 'cancel' | 'override' | 'fail' | 'return';

const DIALOG = {
  cancel: { title: 'Cancel this delivery?', confirmLabel: 'Cancel delivery', description: 'The order stays ready, so you can dispatch it again or switch to customer pickup.' },
  override: {
    title: 'Mark delivered without the agent?',
    confirmLabel: 'Mark delivered',
    description: 'Only when you have confirmed the customer received the order. This override is recorded in the audit log.',
  },
  fail: { title: 'Delivery failed', confirmLabel: 'Mark failed', description: 'The order moves to “delivery failed” so you can retry or return it.' },
  return: { title: 'Package back at the workspace?', confirmLabel: 'Confirm return', description: undefined },
} as const;

/** Workspace controls for one delivery. Agent tasks are progressed by the agent; the workspace may reassign, cancel or override (audited). */
export function TaskActions({ task }: { task: DeliveryTask }) {
  const selfUpdate = useDeliveryAction('selfUpdate');
  const cancel = useDeliveryAction('cancelTask');
  const override = useDeliveryAction('overrideDelivered');
  const [reason, setReason] = useState<ReasonKind | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const prePickup = PRE_PICKUP.includes(task.status);
  const self = task.mode === 'SELF';
  const step = (s: string) => selfUpdate.mutate({ taskId: task.id, step: s });
  const active = reason === 'cancel' ? cancel : reason === 'override' ? override : selfUpdate;

  const primary: React.ReactNode[] = [];
  const secondary: React.ReactNode[] = [];
  if (self) {
    if (task.status === 'PENDING_ASSIGNMENT') primary.push(<Button key="p" size="sm" onClick={() => step('PICKED_UP')}>Left with the package</Button>);
    if (task.status === 'PICKED_UP') secondary.push(<Button key="t" size="sm" variant="outline" onClick={() => step('IN_TRANSIT')}>On the way</Button>);
    if (task.status === 'PICKED_UP' || task.status === 'IN_TRANSIT') {
      primary.push(<Button key="d" size="sm" onClick={() => setCompleteOpen(true)}>Confirm delivered</Button>);
      secondary.push(<Button key="f" size="sm" variant="outline" onClick={() => setReason('fail')}>Failed attempt</Button>);
    }
  } else {
    if (prePickup)
      primary.push(
        <Button key="r" size="sm" variant={task.needsAttention || task.status === 'PENDING_ASSIGNMENT' ? 'default' : 'outline'} onClick={() => setReassignOpen(true)}>
          {task.status === 'PENDING_ASSIGNMENT' ? 'Assign agent' : 'Reassign'}
        </Button>,
      );
    if (['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(task.status))
      secondary.push(<Button key="o" size="sm" variant="outline" onClick={() => setReason('override')}>Override: mark delivered</Button>);
  }
  if (task.status === 'FAILED') primary.push(<Button key="rt" size="sm" onClick={() => setReason('return')}>Returned to workspace</Button>);
  if (prePickup) secondary.push(<Button key="c" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setReason('cancel')}>Cancel delivery</Button>);
  if (!primary.length && !secondary.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {primary}
        {secondary}
      </div>
      {selfUpdate.error && !reason && <ErrorNote message={gqlErrorMessage(selfUpdate.error)} />}
      {reason && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setReason(null)}
          {...DIALOG[reason]}
          destructive={reason === 'cancel' || reason === 'fail'}
          pending={active.isPending}
          error={active.error ? gqlErrorMessage(active.error) : null}
          onConfirm={(text) => {
            const done = { onSuccess: () => setReason(null) };
            if (reason === 'cancel') cancel.mutate({ taskId: task.id, reason: text }, done);
            else if (reason === 'override') override.mutate({ taskId: task.id, reason: text }, done);
            else selfUpdate.mutate({ taskId: task.id, step: reason === 'fail' ? 'FAILED' : 'RETURNED_TO_ORIGIN', reason: text }, done);
          }}
        />
      )}
      {reassignOpen && <DispatchDialog open onOpenChange={setReassignOpen} orqspaceId={task.orqspaceId} target={{ kind: 'reassign', taskId: task.id, taskNumber: task.taskNumber }} />}
      {completeOpen && <CompleteSelfDeliveryDialog task={task} onClose={() => setCompleteOpen(false)} />}
    </div>
  );
}

const money = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 420 or 420.50');

export function CompleteSelfDeliveryDialog({ task, onClose }: { task: Pick<DeliveryTask, 'id' | 'taskNumber' | 'codAmount' | 'requiresOtp'>; onClose: () => void }) {
  const action = useDeliveryAction('selfUpdate');
  const hasCod = Number(task.codAmount) > 0;
  const schema = z.object({
    otp: task.requiresOtp ? z.string().regex(/^\d{4}$/, 'Enter the 4-digit code from the customer') : z.string().optional(),
    recipientName: z.string().max(150).optional(),
    codCollectedAmount: hasCod ? money : z.string().optional(),
    codMethod: z.enum(['CASH', 'UPI_TO_SELLER', 'OTHER']),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { otp: '', recipientName: '', codCollectedAmount: hasCod ? task.codAmount : '', codMethod: 'CASH' } });
  const e = form.formState.errors;
  const submit = (v: Values) =>
    action.mutate(
      {
        taskId: task.id,
        step: 'DELIVERED',
        otp: v.otp || undefined,
        recipientName: v.recipientName || undefined,
        codCollectedAmount: hasCod ? v.codCollectedAmount : undefined,
        codMethod: hasCod ? v.codMethod : undefined,
      },
      { onSuccess: onClose },
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Confirm delivery · {task.taskNumber}</DialogTitle>
            <DialogDescription>{task.requiresOtp ? 'Ask the customer for the 4-digit delivery code shown in their order.' : 'Record who received the order.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {task.requiresOtp && (
              <FormField id="self-otp" label="Delivery code" error={e.otp?.message}>
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={4} className="font-mono tracking-[0.4em]" {...form.register('otp')} />
              </FormField>
            )}
            <FormField id="self-recipient" label="Received by" optional error={e.recipientName?.message}>
              <Input {...form.register('recipientName')} />
            </FormField>
            {hasCod && (
              <>
                <FormField id="self-cod" label={`Cash collected (expected ${formatMoney(task.codAmount)})`} error={e.codCollectedAmount?.message}>
                  <Input inputMode="decimal" {...form.register('codCollectedAmount')} />
                </FormField>
                <FormField id="self-cod-method" label="Collected via">
                  <Select {...form.register('codMethod')}>
                    <option value="CASH">Cash</option>
                    <option value="UPI_TO_SELLER">UPI to seller</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </FormField>
              </>
            )}
          </div>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Confirm delivered'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
