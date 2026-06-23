'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type Status = 'checking' | 'ready' | 'invalid';

export function AcceptInvite() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    // The browser client auto-detects the invite session from the URL hash
    // (#access_token…&type=invite). getSession() resolves after that settles.
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(data.session ? 'ready' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    await supabase.auth.signOut();
    router.push('/download-app');
  }

  if (status === 'checking') {
    return <p className="text-sm text-muted-foreground">Validando seu convite…</p>;
  }

  if (status === 'invalid') {
    return (
      <div className="space-y-3">
        <h2 className="font-heading text-2xl font-bold text-foreground">
          Convite inválido ou expirado
        </h2>
        <p className="text-sm text-muted-foreground">
          Este link de convite não é mais válido. Peça ao seu nutricionista para reenviar o convite.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Crie sua senha</h2>
        <p className="text-sm text-muted-foreground">
          Defina uma senha para concluir seu cadastro no iNutri.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Salvando…' : 'Concluir cadastro'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
