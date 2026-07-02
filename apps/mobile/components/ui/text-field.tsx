import { Text, TextInput, View, type TextInputProps } from 'react-native';

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-foreground">{label}</Text>
      <TextInput
        aria-label={label}
        placeholderTextColor="#8a9a92"
        className="h-12 rounded-xl border border-input bg-card px-3 text-base text-foreground"
        {...props}
      />
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
