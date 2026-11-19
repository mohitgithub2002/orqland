'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { ErrorNote } from '@/components/ui/panel';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useOrderAction } from '../hooks/useOrders';

const schema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(500), restock: z.boolean() });

export function MarkReturnedDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const action = useOrderAction();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { reason: '', restock: true } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => action.mutate({ name: 'markOrderReturned', input: { orderId, ...v } }, { onSuccess: () => onOpenChange(false) }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Mark as returned</DialogTitle>
            <DialogDescription>Closes the order. Refunds are recorded separately in Payments.</DialogDescription>
          </DialogHeader>
          <FormField id="retReason" label="Reason" error={form.formState.errors.reason?.message}>
            <Textarea {...form.register('reason')} />
          </FormField>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span>
              <span className="block text-[13px] font-medium">Put items back in stock</span>
              <span className="block text-[12px] text-muted-foreground">Only for limited-stock items in resaleable condition</span>
            </span>
            <Controller control={form.control} name="restock" render={({ field }) => <Switch aria-label="Restock items" checked={field.value} onCheckedChange={field.onChange} />} />
          </div>
          {action.error && <ErrorNote message={gqlErrorMessage(action.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" disabled={action.isPending}>
              Mark returned
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
