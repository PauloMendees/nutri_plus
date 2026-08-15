import { ActivityIndicator, Pressable, Text } from 'react-native';

const VARIANTS = {
  primary: {
    pressable: 'bg-primary',
    text: 'text-primary-foreground',
    spinner: '#04241b',
  },
  outline: {
    pressable: 'border border-primary bg-transparent',
    text: 'text-primary',
    spinner: '#14bfa6',
  },
} as const;

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: keyof typeof VARIANTS;
}) {
  const tone = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-12 items-center justify-center rounded-xl px-4 ${tone.pressable} ${disabled || loading ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={tone.spinner} />
      ) : (
        <Text className={`font-sans-medium text-base ${tone.text}`}>{label}</Text>
      )}
    </Pressable>
  );
}
