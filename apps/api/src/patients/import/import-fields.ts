export type ImportFieldKey = string;

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  aliases: string[];
}

export const IMPORT_FIELDS: ImportField[] = [
  // Contato e ficha
  { key: 'name', label: 'Nome', aliases: ['Nome completo', 'Paciente', 'Cliente'] },
  { key: 'email', label: 'E-mail', aliases: ['Email', 'Mail', 'Correio'] },
  {
    key: 'phone',
    label: 'Telefone',
    aliases: ['Celular', 'WhatsApp', 'Whats', 'Fone', 'Telefone celular'],
  },
  {
    key: 'birthDate',
    label: 'Data de nascimento',
    aliases: ['Nascimento', 'DN', 'Data nasc', 'Birthday'],
  },
  { key: 'gender', label: 'Sexo', aliases: ['Gênero', 'Sex', 'Genero'] },
  { key: 'height', label: 'Altura (cm)', aliases: ['Altura', 'Estatura', 'Height'] },
  {
    key: 'targetWeight',
    label: 'Peso alvo (kg)',
    aliases: ['Peso meta', 'Peso desejado', 'Meta de peso'],
  },
  { key: 'objective', label: 'Objetivo', aliases: ['Meta', 'Goal'] },
  {
    key: 'activityLevel',
    label: 'Nível de atividade',
    aliases: ['Atividade', 'Atividade física', 'PA'],
  },
  { key: 'restrictions', label: 'Restrições', aliases: ['Restrição alimentar', 'Dieta'] },
  { key: 'allergies', label: 'Alergias', aliases: ['Alergia', 'Alergia alimentar'] },
  {
    key: 'medicalConditions',
    label: 'Condições médicas',
    aliases: ['Patologias', 'Doenças', 'CID', 'Comorbidades'],
  },
  { key: 'notes', label: 'Observações', aliases: ['Notas', 'Obs', 'Observacao', 'Anotações'] },

  // Avaliação
  { key: 'assessment.assessmentDate', label: 'Data da avaliação', aliases: [] },
  {
    key: 'assessment.weight',
    label: 'Peso (kg)',
    aliases: ['Peso', 'Peso atual', 'Weight'],
  },
  {
    key: 'assessment.bodyFatPercentage',
    label: 'Gordura (%)',
    aliases: ['%GC', 'BF%'],
  },
  { key: 'assessment.muscleMass', label: 'Massa muscular (kg)', aliases: [] },
  { key: 'assessment.leanMass', label: 'Massa magra (kg)', aliases: [] },
  { key: 'assessment.muscleMassPercentage', label: 'Massa muscular (%)', aliases: [] },
  { key: 'assessment.leanMassPercentage', label: 'Massa magra (%)', aliases: [] },
  { key: 'assessment.visceralFat', label: 'Gordura visceral', aliases: [] },
  { key: 'assessment.basalMetabolicRate', label: 'TMB', aliases: [] },
  { key: 'assessment.bodyWaterPercentage', label: 'Água corporal (%)', aliases: [] },
  { key: 'assessment.boneMass', label: 'Massa óssea (kg)', aliases: [] },
  { key: 'assessment.metabolicAge', label: 'Idade metabólica', aliases: [] },
  {
    key: 'assessment.waistCircumference',
    label: 'Cintura (cm)',
    aliases: ['Circunferência de cintura', 'CC'],
  },
  {
    key: 'assessment.hipCircumference',
    label: 'Quadril (cm)',
    aliases: ['CQ'],
  },
  { key: 'assessment.chestCircumference', label: 'Tórax (cm)', aliases: [] },
  { key: 'assessment.armCircumference', label: 'Braço (cm)', aliases: [] },
  { key: 'assessment.thighCircumference', label: 'Coxa (cm)', aliases: [] },
  { key: 'assessment.abdomenCircumference', label: 'Abdômen (cm)', aliases: [] },
  {
    key: 'assessment.contractedArmCircumference',
    label: 'Braço contraído (cm)',
    aliases: [],
  },
  { key: 'assessment.calfCircumference', label: 'Panturrilha (cm)', aliases: [] },
  { key: 'assessment.notes', label: 'Notas da avaliação', aliases: [] },

  // Anamnese
  { key: 'anamnese.mainComplaint', label: 'Queixa principal', aliases: [] },
  { key: 'anamnese.medications', label: 'Medicações', aliases: [] },
  { key: 'anamnese.familyHistory', label: 'Histórico familiar', aliases: [] },
  { key: 'anamnese.supplements', label: 'Suplementos', aliases: [] },
  { key: 'anamnese.sleepHoursPerNight', label: 'Horas de sono', aliases: [] },
  { key: 'anamnese.waterIntakeLiters', label: 'Água (L)', aliases: [] },
  { key: 'anamnese.alcoholUse', label: 'Álcool', aliases: [] },
  { key: 'anamnese.smoking', label: 'Tabagismo', aliases: [] },
  {
    key: 'anamnese.physicalActivity',
    label: 'Atividade física (anamnese)',
    aliases: [],
  },
  { key: 'anamnese.bowelHabit', label: 'Hábito intestinal', aliases: [] },
  { key: 'anamnese.mealsPerDay', label: 'Refeições por dia', aliases: [] },
  { key: 'anamnese.eatingHabits', label: 'Hábitos alimentares', aliases: [] },
  { key: 'anamnese.foodPreferences', label: 'Preferências alimentares', aliases: [] },
  { key: 'anamnese.clinicalNotes', label: 'Notas clínicas', aliases: [] },

  // Reservada
  { key: 'ignore', label: 'Ignorar', aliases: ['Ignore', 'Skip'] },
];

export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

const HEADER_INDEX = (() => {
  const map = new Map<string, ImportField>();
  for (const field of IMPORT_FIELDS) {
    map.set(normalizeHeader(field.label), field);
    for (const alias of field.aliases) {
      map.set(normalizeHeader(alias), field);
    }
  }
  return map;
})();

export function fieldByNormalizedHeader(header: string): ImportField | undefined {
  return HEADER_INDEX.get(normalizeHeader(header));
}
