import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '../../../lib/auth';
import { useTheme } from '../../../lib/theme';
import { useMyNutritionist } from '../../../lib/queries/nutritionist';
import { apiFetch } from '../../../lib/api';
import { Screen } from '../../../components/ui/screen';
import type { ModeType } from '../../../components/ui/gluestack-ui-provider';

const THEME_OPTIONS: { label: string; value: ModeType }[] = [
  { label: 'Claro', value: 'light' },
  { label: 'Escuro', value: 'dark' },
  { label: 'Sistema', value: 'system' },
];

export default function ConfiguracoesIndex() {
  const { signOut } = useSession();
  const { mode, setMode } = useTheme();
  const nutritionist = useMyNutritionist();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiFetch('/me', { method: 'DELETE' });
      await signOut();
    } catch {
      setDeleteError('Não foi possível apagar sua conta. Tente novamente.');
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Apagar conta',
      'Isso apagará permanentemente sua conta e todos os seus dados — avaliações, planos e histórico. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: onDelete },
      ],
    );
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-8">
        <Text className="font-heading text-2xl text-foreground">Configurações</Text>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Meu nutricionista</Text>
          <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
            {nutritionist.isLoading ? (
              <ActivityIndicator color="#14bfa6" />
            ) : nutritionist.data ? (
              <>
                {nutritionist.data.logoUrl ? (
                  <Image source={{ uri: nutritionist.data.logoUrl }} className="h-12 w-12 rounded-full" />
                ) : null}
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-medium text-base text-foreground">
                    {nutritionist.data.displayName ?? nutritionist.data.name}
                  </Text>
                  <Text className="font-sans text-sm text-muted-foreground">{nutritionist.data.email}</Text>
                  {nutritionist.data.crn ? (
                    <Text className="font-sans text-sm text-muted-foreground">CRN {nutritionist.data.crn}</Text>
                  ) : null}
                </View>
              </>
            ) : (
              <Text className="font-sans text-sm text-muted-foreground">Nenhum nutricionista vinculado.</Text>
            )}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Conta</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/configuracoes/senha')}
            className="rounded-xl border border-border bg-card p-4"
          >
            <Text className="font-sans-medium text-base text-foreground">Alterar senha</Text>
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Aparência</Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => setMode(opt.value)}
                className={`flex-1 items-center rounded-xl border p-3 ${
                  mode === opt.value ? 'border-primary bg-secondary' : 'border-border bg-card'
                }`}
              >
                <Text
                  className={`font-sans-medium text-sm ${
                    mode === opt.value ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          className="rounded-xl border border-border bg-card p-4"
        >
          <Text className="font-sans-medium text-base text-foreground">Sair</Text>
        </Pressable>

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={deleting}
            className="rounded-xl border border-destructive p-4"
          >
            <Text className="text-center font-sans-medium text-base text-destructive">
              {deleting ? 'Apagando…' : 'Apagar minha conta'}
            </Text>
          </Pressable>
          {deleteError ? (
            <Text className="font-sans text-sm text-destructive">{deleteError}</Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
