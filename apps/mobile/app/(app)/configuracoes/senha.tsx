import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { changePasswordSchema, type ChangePasswordValues } from '../../../lib/validation/auth';
import { mapAuthError } from '../../../lib/auth/errors';
import { Button } from '../../../components/ui/button';
import { TextField } from '../../../components/ui/text-field';
import { Screen } from '../../../components/ui/screen';

export default function AlterarSenha() {
  const { session } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setFormError(null);
    const email = session?.user.email ?? '';
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: values.currentPassword,
    });
    if (signInError) {
      setFormError('Senha atual incorreta.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      setFormError(mapAuthError(updateError));
      return;
    }
    router.back();
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Alterar senha</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Confirme sua senha atual e escolha uma nova.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="currentPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Senha atual"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.currentPassword?.message}
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
                label="Confirmar nova senha"
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

          <Button label="Salvar nova senha" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
