'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status>('checking');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    let active = true;

    // Admin invites arrive via Supabase's implicit flow (#access_token…&type=invite).
    // The @supabase/ssr browser client defaults to flowType 'pkce', which refuses to
    // consume an implicit-grant URL (auth-js throws "Not a valid PKCE flow url"), so
    // detectSessionInUrl never establishes the session. We read the tokens from the
    // hash and set the session explicitly — setSession ignores flowType.
    async function establish() {
      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Strip the tokens from the address bar regardless of the outcome.
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (active) setStatus(!error && data.session ? 'ready' : 'invalid');
        return;
      }

      // No invite tokens in the URL — fall back to an existing session (e.g. a revisit).
      const { data } = await supabase.auth.getSession();
      if (active) setStatus(data.session ? 'ready' : 'invalid');
    }

    establish();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    // Best-effort: the password is already set; sign out and continue regardless.
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
