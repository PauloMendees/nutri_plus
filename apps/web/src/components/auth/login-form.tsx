'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, type LoginValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
        <p className="text-sm text-muted-foreground">Entre na sua conta para continuar.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="voce@clinica.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <span className="cursor-not-allowed text-sm font-medium text-primary/60" aria-disabled>
              Esqueceu a senha?
            </span>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Novo no iNutri?{' '}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
