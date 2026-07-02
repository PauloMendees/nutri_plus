import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { loginSchema, type LoginValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';

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
    <ScrollView contentContainerClassName="flex-1 justify-center bg-background p-6" keyboardShouldPersistTaps="handled">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-3xl text-primary">iNutri</Text>
          <Text className="font-heading-semibold text-xl text-foreground">Bem-vindo de volta</Text>
          <Text className="text-base text-muted-foreground">Entre na sua conta para continuar.</Text>
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

          {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}

          <Button label="Entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </ScrollView>
  );
}
