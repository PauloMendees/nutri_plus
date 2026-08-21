import { Alert, Linking } from 'react-native';
import { whatsappMeUrl } from '@nutri-plus/shared-types';
import { Button } from '../ui/button';

export function ChatWithNutritionistButton({
  whatsappNumber,
}: {
  whatsappNumber: string | null | undefined;
}) {
  if (!whatsappNumber) return null;
  async function onPress() {
    const url = whatsappMeUrl(whatsappNumber!);
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('cannot open');
      await Linking.openURL(url);
    } catch {
      Alert.alert('WhatsApp', 'Não foi possível abrir o WhatsApp.');
    }
  }
  return <Button label="Conversar com nutricionista" onPress={onPress} variant="outline" />;
}
