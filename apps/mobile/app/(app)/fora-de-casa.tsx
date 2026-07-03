import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../components/ui/screen';
import { TextField } from '../../components/ui/text-field';
import { Button } from '../../components/ui/button';
import { useOutsideHome } from '../../lib/queries/outside-home';

export default function ForaDeCasa() {
  const [message, setMessage] = useState('');
  const outside = useOutsideHome();

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-4">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">Fora de casa</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Diga onde você está e o que tem por perto — sugerimos algo alinhado ao seu plano.
          </Text>
        </View>

        <TextField
          label="Sua situação"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Ex.: Estou numa hamburgueria com amigos"
        />

        <Button
          label="Pedir sugestão"
          onPress={() => outside.mutate({ message: message.trim() })}
          disabled={message.trim().length === 0}
          loading={outside.isPending}
        />

        {outside.isError ? (
          <Text className="font-sans text-sm text-destructive">
            Não foi possível gerar a sugestão. Tente novamente.
          </Text>
        ) : null}

        {outside.data ? (
          <View className="gap-1 rounded-xl border border-border bg-card p-4">
            <Text className="font-sans-medium text-sm text-primary">Sugestão</Text>
            <Text className="font-sans text-base text-foreground">{outside.data.suggestion}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
