import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateAssessmentRequest } from '@nutri-plus/shared-types';
import { assessmentSchema, type AssessmentValues } from '../../lib/validation/assessment';
import { useCreateMyAssessment } from '../../lib/queries/assessments';
import { Screen } from '../../components/ui/screen';
import { TextField } from '../../components/ui/text-field';
import { Button } from '../../components/ui/button';

const today = () => new Date().toISOString().slice(0, 10);

// [key, label] mirroring the web form's fields + order.
const FIELDS: { key: keyof AssessmentValues; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular (kg)' },
  { key: 'leanMass', label: 'Massa magra (kg)' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB (kcal)' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'boneMass', label: 'Massa óssea (kg)' },
  { key: 'metabolicAge', label: 'Idade metabólica' },
  { key: 'waistCircumference', label: 'Cintura (cm)' },
  { key: 'hipCircumference', label: 'Quadril (cm)' },
  { key: 'chestCircumference', label: 'Peito (cm)' },
  { key: 'armCircumference', label: 'Braço (cm)' },
  { key: 'thighCircumference', label: 'Coxa (cm)' },
];

export default function NovaMedicao() {
  const create = useCreateMyAssessment();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema) as Resolver<AssessmentValues>,
    // All numeric fields start empty (strings); zod coerces on submit.
    defaultValues: { assessmentDate: today() } as unknown as AssessmentValues,
  });

  async function onSubmit(values: AssessmentValues) {
    setFormError(null);
    try {
      await create.mutateAsync(values as CreateAssessmentRequest);
      router.back();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Nova medição</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Registre suas medidas para acompanhar sua evolução.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="assessmentDate"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Data (AAAA-MM-DD)"
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={today()}
                error={errors.assessmentDate?.message}
              />
            )}
          />

          {FIELDS.map((f) => (
            <Controller
              key={f.key}
              control={control}
              name={f.key}
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={f.label}
                  value={value == null ? '' : String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numeric"
                  placeholder="—"
                  error={errors[f.key]?.message}
                />
              )}
            />
          ))}

          <Controller
            control={control}
            name="notes"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Observações"
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                placeholder="Opcional"
                error={errors.notes?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Salvar medição" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
