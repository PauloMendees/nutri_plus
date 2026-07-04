import { Text, View } from 'react-native';
import { useSession } from '../../../lib/auth';
import { Button } from '../../../components/ui/button';

export default function Configuracoes() {
  const { session, signOut } = useSession();
  return (
    <View className="flex-1 justify-between bg-background p-6">
      <View className="gap-1">
        <Text className="font-heading text-2xl text-foreground">Configurações</Text>
        <Text className="font-sans text-base text-muted-foreground">{session?.user.email ?? ''}</Text>
      </View>
      <Button label="Sair" onPress={signOut} />
    </View>
  );
}
