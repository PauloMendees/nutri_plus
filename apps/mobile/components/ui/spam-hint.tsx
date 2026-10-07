import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Aviso fixo depois de enviar um e-mail ao próprio usuário: muitos provedores
// mandam o primeiro e-mail do iNutri para o spam.
export function SpamHint() {
  return (
    <View className="flex-row items-start gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5">
      <Ionicons name="mail-outline" size={18} color="#14bfa6" style={{ marginTop: 1 }} />
      <Text className="flex-1 font-sans text-sm text-foreground">
        Não encontrou o e-mail? Confira também a caixa de{' '}
        <Text className="font-sans-medium">spam</Text> ou de{' '}
        <Text className="font-sans-medium">lixo eletrônico</Text>.
      </Text>
    </View>
  );
}
