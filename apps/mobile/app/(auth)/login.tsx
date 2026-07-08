import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { loginSchema, type LoginValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { Screen } from '../../components/ui/screen';
import { Logo } from '../../components/brand/logo';

export default function Login() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    // On success the auth listener updates the session and (auth)/_layout redirects.
  }

  return (
    <Screen contentContainerClassName="grow justify-center p-6">
      <View className="gap-8">
        <View className="items-center gap-2">
          <Logo tone="dark" width={132} />
          <Text className="mt-2 font-heading-semibold text-2xl text-foreground text-center">Bem-vindo de volta</Text>
          <Text className="font-sans text-base text-muted-foreground text-center">Entre na sua conta para continuar.</Text>
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
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                error={errors.password?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
          <Text
            onPress={() => router.push('/forgot-password')}
            className="text-center font-sans text-sm text-primary"
          >
            Esqueci minha senha
          </Text>
        </View>
      </View>
    </Screen>
  );
}
