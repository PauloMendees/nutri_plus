import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSession } from '../../../lib/auth';
import { useTheme, useThemeColor } from '../../../lib/theme';
import { useMyNutritionist } from '../../../lib/queries/nutritionist';
import { downloadMyData } from '../../../lib/queries/data-export';
import { apiFetch } from '../../../lib/api';
import { registerForPush, unregisterPush } from '../../../lib/push';
import { Screen } from '../../../components/ui/screen';
import { BrandHeader } from '../../../components/brand/brand-header';
import { ChatWithNutritionistButton } from '../../../components/nutritionist/chat-button';
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
  const primaryColor = useThemeColor('--primary');
  const foregroundColor = useThemeColor('--foreground');
  const destructiveColor = useThemeColor('--destructive');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('push-token').then((t) => setPushOn(!!t));
  }, []);

  async function onTogglePush(next: boolean) {
    setPushBusy(true);
    try {
      if (next) {
        const result = await registerForPush();
        if ('denied' in result) {
          Alert.alert(
            'Permissão negada',
            'Ative as notificações nas configurações do sistema para receber lembretes.',
          );
          setPushOn(false);
          return;
        }
        await SecureStore.setItemAsync('push-token', result.token);
        setPushOn(true);
      } else {
        const token = await SecureStore.getItemAsync('push-token');
        if (token) await unregisterPush(token);
        await SecureStore.deleteItemAsync('push-token');
        setPushOn(false);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar os lembretes. Tente novamente.');
      setPushOn(!next);
    } finally {
      setPushBusy(false);
    }
  }

  async function onExport() {
    setExportError(null);
    setExporting(true);
    try {
      await downloadMyData();
    } catch {
      setExportError('Não foi possível exportar seus dados. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }

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
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
      <View className="gap-8">
        <Text className="font-heading text-2xl text-foreground">Configurações</Text>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Meu nutricionista</Text>
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-3">
              {nutritionist.isLoading ? (
                <ActivityIndicator color={primaryColor} />
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
            <ChatWithNutritionistButton whatsappNumber={nutritionist.data?.whatsappNumber} />
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
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  onPress={() => setMode(opt.value)}
                  className={`flex-1 items-center rounded-xl border p-3 ${
                    active ? 'border-primary bg-secondary' : 'border-border bg-card'
                  }`}
                >
                  <Text
                    className={`font-sans-medium text-sm ${active ? 'text-primary' : 'text-foreground'}`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Notificações</Text>
          <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4">
            <Text className="font-sans-medium text-base text-foreground">Lembretes de consulta</Text>
            <Switch
              accessibilityLabel="Lembretes de consulta"
              value={pushOn}
              onValueChange={onTogglePush}
              disabled={pushBusy}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
        >
          <Ionicons name="log-out-outline" size={20} color={foregroundColor} />
          <Text className="font-sans-medium text-base text-foreground">Sair</Text>
        </Pressable>

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onExport}
            disabled={exporting}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-border p-4"
          >
            <Ionicons name="download-outline" size={20} color={foregroundColor} />
            <Text className="font-sans-medium text-base text-foreground">
              {exporting ? 'Exportando…' : 'Exportar meus dados'}
            </Text>
          </Pressable>
          {exportError ? (
            <Text className="font-sans text-sm text-destructive">{exportError}</Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={deleting}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-destructive p-4"
          >
            <Ionicons name="trash-outline" size={20} color={destructiveColor} />
            <Text className="font-sans-medium text-base text-destructive">
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
