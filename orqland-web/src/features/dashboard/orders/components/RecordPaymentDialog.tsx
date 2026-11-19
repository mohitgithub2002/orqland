'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useOrderAction } from '../hooks/useOrders';
import type { OrderDetail } from '../types/order.types';

const schema = z
  .object({
    kind: z.enum(['PAYMENT', 'REFUND']),
    method: z.enum(['ONLINE', 'COD']),
    status: z.enum(['SUCCEEDED', 'FAILED']),
    amount: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 499 or 499.50'),
    providerReference: z.string().max(120).optional(),
    failureReason: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'FAILED' && !(v.failureReason ?? '').trim()) ctx.addIssue({ code: 'custom', path: ['failureReason'], message: 'Say why the payment failed' });
  });
type Values = z.infer<typeof schema>;

/**
 * Manual payment ledger entry (UPI reference, bank transfer, refund). COD cash is reconciled in
 * Delivery → COD instead, so the order is only marked paid after the handover.
 */
export function RecordPaymentDialog({ order, open, onOpenChange }: { order: OrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const action = useOrderAction();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'PAYMENT', method: order.paymentMethod === 'COD' ? 'COD' : 'ONLINE', status: 'SUCCEEDED', amount: order.totalAmount, providerReference: '', failureReason: '' },
  });
  const status = form.watch('status');
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ops-theme">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            action.mutate(
              { name: 'recordOrderPayment', input: { orderId: order.id, ...v, providerReference: v.providerReference || undefined, failureReason: v.failureReason || undefined } },
              { onSuccess: () => onOpenChange(false) },
            ),
          )}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Record payment · {order.orderNumber}</DialogTitle>
            <DialogDescription>The order’s payment status is calculated from these records.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="payKind" label="Type">
              <Select {...form.register('kind')}>
                <option value="PAYMENT">Payment received</option>
                <option value="REFUND">Refund issued</option>
              </Select>
            </FormField>
            <FormField id="payStatus" label="Result">
              <Select {...form.register('status')}>
                <option value="SUCCEEDED">Succeeded</option>
                <option value="FAILED">Failed</option>
              </Select>
            </FormField>
            <FormField id="payMethod" label="Method">
              <Select {...form.register('method')}>
                <option value="ONLINE">Online / UPI / bank</option>
                <option value="COD">Cash at counter</option>
              </Select>
            </FormField>
            <FormField id="payAmount" label="Amount (₹)" error={e.amount?.message}>
              <Input inputMode="decimal" {...form.register('amount')} />
            </FormField>
            <FormField id="payRef" label="Reference" optional className="sm:col-span-2">
              <Input className="font-mono" placeholder="UPI / transaction reference" {...form.register('providerReference')} />
            </FormField>
            {status === 'FAILED' && (
              <FormField id="payFail" label="Failure reason" error={e.failureReason?.message} className="sm:col-span-2">
                <Input {...form.register('failureReason')} />
              </FormField>
            )}
          </div>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? 'Saving…' : 'Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
