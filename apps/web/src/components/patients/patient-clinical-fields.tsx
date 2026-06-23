'use client';

import type { Control } from 'react-hook-form';
import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';
import { ACTIVITY_LABELS, GENDER_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Shared by the create and edit forms. The clinical field names are a strict
// subset shared by createPatientSchema and updatePatientSchema, so a loose
// Control type keeps this reusable across both form value shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PatientClinicalFields({ control }: { control: Control<any> }) {
  return (
    <>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Pessoal</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="birthDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de nascimento</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gênero</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(Gender).map((g) => (
                      <SelectItem key={g} value={g}>
                        {GENDER_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Medidas &amp; objetivo</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Altura (cm)</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" placeholder="Ex: 170" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="targetWeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Peso-alvo (kg)</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" placeholder="Ex: 68" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="objective"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Objetivo</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(PatientObjective).map((o) => (
                      <SelectItem key={o} value={o}>
                        {OBJECTIVE_LABELS[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="activityLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nível de atividade</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(ActivityLevel).map((a) => (
                      <SelectItem key={a} value={a}>
                        {ACTIVITY_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Saúde</h3>
        <div className="grid gap-4">
          {(
            [
              ['restrictions', 'Restrições alimentares'],
              ['allergies', 'Alergias'],
              ['medicalConditions', 'Condições médicas'],
              ['notes', 'Observações'],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      </section>
    </>
  );
}
