import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoToBrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = isoToLocalDate(value);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const will = Keyboard.addListener('keyboardWillShow', close);
    const did = Keyboard.addListener('keyboardDidShow', close);
    return () => {
      will.remove();
      did.remove();
    };
  }, [open]);

  function onPickerChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') {
      setOpen(false);
      return;
    }
    if (event.type === 'set' && next) onChange(dateToIsoLocal(next));
  }

  return (
    <View className="gap-1">
      <Text className="font-sans text-sm text-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="h-12 justify-center rounded-xl border border-input bg-card px-3"
      >
        <Text testID="date-picker-value" className="font-sans text-base text-foreground">
          {isoToBrDate(value)}
        </Text>
      </Pressable>
      {open ? (
        <View>
          <DateTimePicker
            value={selected}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            locale="pt-BR"
            onChange={onPickerChange}
            testID="date-time-picker"
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Concluir"
              onPress={() => setOpen(false)}
              className="items-end py-2"
            >
              <Text className="font-sans-medium text-sm text-primary">Concluir</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
