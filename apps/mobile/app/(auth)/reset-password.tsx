import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { resetPasswordSchema, type ResetPasswordValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { Screen } from '../../components/ui/screen';

const RESEND_COOLDOWN_SECONDS = 30;

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  // Tick the resend cooldown down to zero; cleared on unmount.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onResend() {
    if (cooldown > 0 || !email) return;
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email ?? '',
        token: values.code,
        type: 'recovery',
      });
      if (verifyError) {
        setFormError('Código inválido ou expirado. Peça um novo.');
        return;
      }
      setVerified(true);
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      setFormError(mapAuthError(updateError));
      return;
    }
    router.replace('/(app)');
  }

  return (
    <Screen contentContainerClassName="grow justify-center p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Defina uma nova senha</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Enviamos um código para {email ?? 'seu e-mail'}. Digite o código e escolha uma nova senha.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Código"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                error={errors.code?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Nova senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.password?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Confirmar senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Salvar e entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

          <Text
            onPress={onResend}
            className={`text-center font-sans text-sm ${cooldown > 0 ? 'text-muted-foreground' : 'text-primary'}`}
          >
            {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
