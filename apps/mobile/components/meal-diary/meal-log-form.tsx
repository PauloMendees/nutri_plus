import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CreateMealLogRequest, MealPlan, MealPlanSummary } from '@nutri-plus/shared-types';
import { Button } from '../ui/button';
import { DatePickerField } from '../ui/date-picker-field';
import { TextField } from '../ui/text-field';

export type MealLogFormValues = {
  consumedAtDate: string; // YYYY-MM-DD
  consumedAtTime: string; // HH:mm
  source: 'PLAN' | 'FREE_TEXT';
  mealOptionId: string;
  freeText: string;
  note: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatLocalTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function mealIdForOption(plan: MealPlan | null, optionId: string): string {
  if (!plan || !optionId) return '';
  return plan.meals.find((meal) => meal.options.some((opt) => opt.id === optionId))?.id ?? '';
}

export function MealLogForm({
  plans,
  plan,
  submitting,
  onSubmit,
  initialValues,
}: {
  plans: MealPlanSummary[];
  plan: MealPlan | null;
  submitting: boolean;
  onSubmit: (body: CreateMealLogRequest) => void;
  initialValues?: Partial<MealLogFormValues>;
}) {
  const now = useMemo(() => new Date(), []);
  const [consumedAtDate, setConsumedAtDate] = useState(
    initialValues?.consumedAtDate ?? formatLocalDate(now),
  );
  const [consumedAtTime, setConsumedAtTime] = useState(
    initialValues?.consumedAtTime ?? formatLocalTime(now),
  );
  const noPlan = plans.length === 0;
  const [source, setSource] = useState<'PLAN' | 'FREE_TEXT'>(
    noPlan ? 'FREE_TEXT' : (initialValues?.source ?? 'PLAN'),
  );
  const [mealOptionId, setMealOptionId] = useState(initialValues?.mealOptionId ?? '');
  const [selectedMealId, setSelectedMealId] = useState(
    () => mealIdForOption(plan, initialValues?.mealOptionId ?? ''),
  );
  const [freeText, setFreeText] = useState(initialValues?.freeText ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const selectableMeals = (plan?.meals ?? [])
    .filter((meal) => meal.options.length > 0)
    .slice()
    .sort((a, b) => a.order - b.order);

  function handleSave() {
    const consumed = new Date(`${consumedAtDate}T${consumedAtTime}:00`);
    if (Number.isNaN(consumed.getTime())) {
      setFormError('Preencha a data e a hora.');
      return;
    }
    const consumedAt = consumed.toISOString();
    const trimmedNote = note.trim();

    if (source === 'PLAN' && !noPlan) {
      if (!mealOptionId) {
        setFormError('Selecione uma opção do plano.');
        return;
      }
      setFormError(null);
      onSubmit({
        consumedAt,
        source: 'PLAN',
        mealOptionId,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      return;
    }

    const trimmed = freeText.trim();
    if (!trimmed) {
      setFormError('Preencha a descrição.');
      return;
    }
    setFormError(null);
    onSubmit({
      consumedAt,
      source: 'FREE_TEXT',
      freeText: trimmed,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    });
  }

  return (
    <View className="gap-4">
      <DatePickerField
        label="Data (DD/MM/AAAA)"
        value={consumedAtDate}
        onChange={setConsumedAtDate}
      />
      <TextField
        label="Hora (HH:mm)"
        value={consumedAtTime}
        onChangeText={setConsumedAtTime}
        autoCapitalize="none"
        placeholder="HH:mm"
      />

      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={noPlan}
          onPress={() => setSource('PLAN')}
          className={`flex-1 items-center rounded-xl border p-3 ${
            source === 'PLAN' && !noPlan ? 'border-primary bg-secondary' : 'border-border bg-card'
          } ${noPlan ? 'opacity-60' : ''}`}
        >
          <Text
            className={`font-sans-medium text-sm ${
              source === 'PLAN' && !noPlan ? 'text-primary' : 'text-foreground'
            }`}
          >
            Do meu plano
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSource('FREE_TEXT')}
          className={`flex-1 items-center rounded-xl border p-3 ${
            source === 'FREE_TEXT' ? 'border-primary bg-secondary' : 'border-border bg-card'
          }`}
        >
          <Text
            className={`font-sans-medium text-sm ${
              source === 'FREE_TEXT' ? 'text-primary' : 'text-foreground'
            }`}
          >
            Outra refeição
          </Text>
        </Pressable>
      </View>

      {noPlan ? (
        <Text className="font-sans text-sm text-muted-foreground">
          Nenhum plano disponível. Descreva a refeição.
        </Text>
      ) : null}

      {source === 'PLAN' && !noPlan ? (
        <View className="gap-3">
          {selectableMeals.map((meal) => (
            <View key={meal.id} className="gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (selectedMealId !== meal.id) setMealOptionId('');
                  setSelectedMealId(meal.id);
                }}
                className={`rounded-xl border p-4 ${
                  selectedMealId === meal.id ? 'border-primary bg-secondary' : 'border-border bg-card'
                }`}
              >
                <Text className="font-sans-medium text-base text-foreground">
                  {meal.timeLabel ? `${meal.timeLabel} · ` : ''}
                  {meal.name ?? 'Refeição'}
                </Text>
              </Pressable>
              {selectedMealId === meal.id ? (
                <View testID={`meal-${meal.id}-options`} className="ml-4 gap-2">
                  {meal.options
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((opt) => (
                      <Pressable
                        key={opt.id}
                        accessibilityRole="button"
                        onPress={() => setMealOptionId(opt.id)}
                        className={`gap-1 rounded-xl border-2 border-dashed p-4 ${
                          mealOptionId === opt.id
                            ? 'border-primary bg-secondary'
                            : 'border-primary/40 bg-card'
                        }`}
                      >
                        <Text className="font-sans-medium text-sm text-primary">
                          {opt.label ?? 'Opção'}
                        </Text>
                        {opt.items.map((item) => (
                          <Text key={item.id} className="font-sans text-sm text-foreground">
                            {item.foodName ?? '—'}
                            {item.quantity ? ` · ${item.quantity}` : ''}
                          </Text>
                        ))}
                      </Pressable>
                    ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {source === 'FREE_TEXT' ? (
        <TextField
          label="Descrição"
          value={freeText}
          onChangeText={setFreeText}
          multiline
          placeholder="O que você comeu?"
        />
      ) : null}

      <TextField label="Nota" value={note} onChangeText={setNote} multiline placeholder="Opcional" />

      {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}
      <Button label="Salvar" onPress={handleSave} loading={submitting} />
    </View>
  );
}
