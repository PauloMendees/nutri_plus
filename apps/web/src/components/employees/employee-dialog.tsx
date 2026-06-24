'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Employee } from '@nutri-plus/shared-types';
import { inviteEmployeeSchema, updateEmployeeSchema } from '@/lib/validation/employee';
import {
  useDeleteEmployee,
  useInviteEmployee,
  useUpdateEmployee,
} from '@/lib/queries/employees';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type EmployeeFormValues = { name: string; email: string };

function defaults(employee?: Employee): EmployeeFormValues {
  return {
    name: employee?.user.name ?? '',
    email: employee?.user.email ?? '',
  };
}

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
}) {
  const isEdit = Boolean(employee);
  const invite = useInviteEmployee();
  const update = useUpdateEmployee();
  const remove = useDeleteEmployee();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(
      isEdit ? updateEmployeeSchema : inviteEmployeeSchema,
    ) as unknown as Resolver<EmployeeFormValues>,
    defaultValues: defaults(employee),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(employee));
      setFormError(null);
      setConfirmingDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  async function onSubmit(values: EmployeeFormValues) {
    setFormError(null);
    try {
      if (employee) {
        await update.mutateAsync({ id: employee.id, body: { name: values.name } });
        toast.success('Funcionário atualizado.');
      } else {
        await invite.mutateAsync({ name: values.name, email: values.email });
        toast.success('Convite enviado.');
      }
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? 'Já existe um usuário com este e-mail.'
          : 'Não foi possível salvar. Tente novamente.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!employee) return;
    try {
      await remove.mutateAsync(employee.id);
      toast.success('Funcionário removido.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível remover o funcionário.');
    }
  }

  const pending =
    form.formState.isSubmitting || invite.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit ? (
              // Plain Label (not FormLabel): this field is outside a FormField, and
              // FormLabel reads FormField context. The email is read-only display.
              <div className="space-y-1">
                <Label htmlFor="employee-email">E-mail</Label>
                <Input
                  id="employee-email"
                  type="email"
                  value={employee?.user.email ?? ''}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  O e-mail é a identidade de acesso e não pode ser alterado.
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="funcionario@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                O funcionário receberá um convite por e-mail.
              </p>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            {confirmingDelete ? (
              <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <p className="mr-auto text-sm text-muted-foreground">
                  Remover {employee?.user.name}? Esta ação não pode ser desfeita.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={remove.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Removendo…' : 'Remover'}
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter className="justify-end">
                {isEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mr-auto rounded-full text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-full" disabled={pending}>
                  {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Enviar convite'}
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
