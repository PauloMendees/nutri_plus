import { Text, TextInput, View, type TextInputProps } from 'react-native';

export function TextField({
  label,
  error,
  multiline,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  // Single-line fields keep a fixed height; multiline uses a min-height (grows
  // with content) + top-aligned text. A fixed height on a multiline field makes
  // its rendered box outgrow its laid-out box and overlap the next element.
  return (
    <View className="gap-1">
      <Text className="font-sans text-sm text-foreground">{label}</Text>
      <TextInput
        aria-label={label}
        placeholderTextColor="#8a9a92"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-xl border border-input bg-card px-3 font-sans text-base text-foreground ${
          multiline ? 'min-h-[120px] py-3' : 'h-12'
        }`}
        {...props}
      />
      {error ? <Text className="font-sans text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
