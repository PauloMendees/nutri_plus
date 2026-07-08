import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function TextField({
  label,
  error,
  multiline,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  // Password fields get a show/hide toggle: the eye button flips secureTextEntry
  // so the user can verify what they typed. Non-secure fields render unchanged.
  const [visible, setVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  // Single-line fields keep a fixed height; multiline uses a min-height (grows
  // with content) + top-aligned text. A fixed height on a multiline field makes
  // its rendered box outgrow its laid-out box and overlap the next element.
  return (
    <View className="gap-1">
      <Text className="font-sans text-sm text-foreground">{label}</Text>
      <View className="relative justify-center">
        <TextInput
          aria-label={label}
          placeholderTextColor="#8a9a92"
          multiline={multiline}
          secureTextEntry={isPassword && !visible}
          textAlignVertical={multiline ? 'top' : 'center'}
          className={`rounded-xl border border-input bg-card px-3 font-sans text-base text-foreground ${
            multiline ? 'min-h-[120px] py-3' : 'h-12'
          } ${isPassword ? 'pr-12' : ''}`}
          {...props}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            className="absolute right-3 h-12 justify-center"
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8a9a92" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="font-sans text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
