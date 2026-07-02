import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background p-6">
      <Text className="font-heading text-2xl text-foreground">Olá!</Text>
      <Text className="text-center text-base text-muted-foreground">
        Seus planos alimentares aparecerão aqui em breve.
      </Text>
    </View>
  );
}
