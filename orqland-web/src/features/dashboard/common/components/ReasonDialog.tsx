'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { ErrorNote } from '@/components/ui/panel';
import { Textarea } from '@/components/ui/textarea';

const schema = z.object({ reason: z.string().trim().min(3, 'Give a short reason (at least 3 characters)').max(500, 'Keep it under 500 characters') });

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
}

/** Every rejection, cancellation, reassignment and override requires a recorded reason. */
export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive, pending, error, onConfirm, children }: ReasonDialogProps) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { reason: '' } });
  useEffect(() => {
    if (!open) form.reset({ reason: '' });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ops-theme">
        <form onSubmit={form.handleSubmit((v) => onConfirm(v.reason))} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <FormField id="reason" label="Reason" hint="Recorded in the timeline and audit log." error={form.formState.errors.reason?.message}>
            <Textarea placeholder="e.g. Customer asked to cancel" maxLength={500} {...form.register('reason')} />
          </FormField>
          {error && <ErrorNote message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
