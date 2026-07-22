import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../ui/button';
import { useAcceptConsent } from '../../lib/queries/consent';
import { useSession } from '../../lib/auth';

const PRIVACY_POLICY_URL = 'https://inutri.life/privacy';

export function ConsentGate({ currentVersion }: { currentVersion: string }) {
  const [accepted, setAccepted] = useState(false);
  const accept = useAcceptConsent();
  const { signOut } = useSession();

  return (
    <ScrollView contentContainerClassName="grow justify-center gap-6 bg-background p-6">
      <Text className="font-heading text-2xl text-foreground">Consentimento de dados</Text>
      <Text className="font-sans text-base text-muted-foreground">
        Li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais e de
        saúde pelo iNutri, conforme a LGPD (Lei 13.709/2018).
      </Text>
      <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} accessibilityRole="link">
        <Text className="font-sans-medium text-base text-primary">Ler política completa</Text>
      </Pressable>
      <Pressable
        onPress={() => setAccepted((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        className="flex-row items-center gap-3"
      >
        <View
          className={`h-6 w-6 rounded border border-border ${accepted ? 'bg-primary' : 'bg-transparent'}`}
        />
        <Text className="font-sans text-base text-foreground">Li e aceito</Text>
      </Pressable>
      {accept.isError ? (
        <Text className="font-sans text-sm text-destructive">
          Não foi possível registrar o consentimento. Tente novamente.
        </Text>
      ) : null}
      <Button
        label="Aceitar e continuar"
        loading={accept.isPending}
        disabled={!accepted}
        onPress={() => {
          if (accepted) accept.mutate(currentVersion);
        }}
      />
      <Pressable onPress={signOut} accessibilityRole="button">
        <Text className="text-center font-sans-medium text-base text-muted-foreground">Recusar</Text>
      </Pressable>
    </ScrollView>
  );
}
