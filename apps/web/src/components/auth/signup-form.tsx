'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { createSignupClient } from '@/lib/supabase/client';
import { signupSchema, type SignupValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { parseSignupPlan } from '@/lib/billing/signup-plan';
import { trackCompleteRegistration } from '@/lib/analytics/meta-conversions';
import { CAPTCHA_FAILED_MESSAGE, turnstileSiteKey, verifySignupGate } from '@/lib/auth/signup-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chosenPlan = parseSignupPlan(searchParams.get('plan'));
  const [formError, setFormError] = useState<string | null>(null);

  // Gate de cadastro (CONTEXT.md): sem site key o widget não existe e o fluxo é
  // o de sempre. Com site key, o botão só libera com token, e o token é
  // verificado no servidor antes do signUp.
  const siteKey = turnstileSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  function resetCaptcha() {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: SignupValues) {
    setFormError(null);
    if (siteKey) {
      const gate = await verifySignupGate(captchaToken ?? '');
      // Token do Turnstile é de uso único: qualquer resultado exige novo desafio.
      resetCaptcha();
      if (gate === 'captcha_failed') {
        setFormError(CAPTCHA_FAILED_MESSAGE);
        return;
      }
      if (gate === 'error') {
        setFormError(mapAuthError(null));
        return;
      }
    }
    // Client de cadastro (flowType implicit): faz o token do e-mail sair sem
    // prefixo pkce_, para a confirmação funcionar em qualquer navegador.
    const supabase = createSignupClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { name: values.name },
        // `?plan=` sempre presente (vazio quando não houve escolha): o template
        // de e-mail do Supabase concatena `&token_hash=…&type=signup` nesta
        // URL, e sem query string a concatenação viraria parte do path.
        // parseSignupPlan('') devolve null, então o vazio é inofensivo.
        emailRedirectTo: `${window.location.origin}/auth/callback?plan=${
          chosenPlan === 'PRO' ? 'pro' : chosenPlan === 'ESSENCIAL' ? 'essencial' : ''
        }`,
      },
    });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    trackCompleteRegistration(values.email, values.name);
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Crie sua conta</h2>
        <p className="text-sm text-muted-foreground">Comece a organizar seus atendimentos.</p>
        {chosenPlan && (
          <p className="text-sm text-foreground">
            Plano escolhido: <strong>{chosenPlan === 'PRO' ? 'Pro' : 'Essencial'}</strong>
          </p>
        )}
      </div>

      <Form {...form}>
        {/* eslint-disable-next-line react-hooks/refs -- react-hook-form's handleSubmit only
            invokes onSubmit later, from the DOM submit event, never during this render call;
            the lint rule can't see that library detail and flags it as an over-conservative
            ref-during-render risk because onSubmit reads turnstileRef via resetCaptcha. */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Seu nome" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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

          {siteKey && (
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              options={{ appearance: 'interaction-only', language: 'pt-BR' }}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={form.formState.isSubmitting || (Boolean(siteKey) && !captchaToken)}
          >
            {form.formState.isSubmitting ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
