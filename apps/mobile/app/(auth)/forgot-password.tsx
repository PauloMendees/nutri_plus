import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { Screen } from '../../components/ui/screen';

export default function ForgotPassword() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email);
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    // No separate "verifique seu e-mail" screen: go straight to code entry. A
    // non-existent e-mail navigates identically (no code arrives), preserving
    // the no-enumeration posture.
    router.push({ pathname: '/reset-password', params: { email: values.email } });
  }

  return (
    <Screen contentContainerClassName="grow justify-center p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Esqueceu a senha?</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Informe seu e-mail e enviaremos um código para redefinir.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="E-mail"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="voce@email.com"
                error={errors.email?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Enviar código" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

          <Text onPress={() => router.push('/login')} className="text-center font-sans text-sm text-primary">
            Voltar para o login
          </Text>
        </View>
      </View>
    </Screen>
  );
}
