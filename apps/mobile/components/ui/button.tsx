import { ActivityIndicator, Pressable, Text } from 'react-native';

export function Button({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-12 items-center justify-center rounded-xl bg-primary px-4 ${disabled || loading ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color="#04241b" />
      ) : (
        <Text className="font-medium text-base text-primary-foreground">{label}</Text>
      )}
    </Pressable>
  );
}
