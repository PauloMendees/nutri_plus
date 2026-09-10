import type {
  CreatePatientRequest,
  ImportCommitResponse,
  ImportPreviewResponse,
  PatientInviteStatus,
  PatientSummary,
  UpdatePatientRequest,
} from '@nutri-plus/shared-types';
import type { AppointmentPatientSummary } from '@nutri-plus/shared-types';

describe('patient identity types', () => {
  it('PatientSummary carries ficha fields, not user.name', () => {
    const row: PatientSummary = {
      id: 'p1',
      name: 'Maria Silva',
      email: null,
      phone: '5511999998888',
      inviteStatus: 'NOT_INVITED' satisfies PatientInviteStatus,
      user: null,
      nutritionistId: 'n1',
      birthDate: null,
      gender: null,
      height: null,
      imc: null,
      targetWeight: null,
      objective: null,
      activityLevel: null,
      restrictions: null,
      allergies: null,
      medicalConditions: null,
      notes: null,
      canLogAssessments: false,
      showMealTargetToPatient: false,
      photoUrl: null,
      isDemo: false,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    expect(row.user).toBeNull();
    const created: CreatePatientRequest = { name: 'Maria Silva' };
    expect(created.email).toBeUndefined();
    const patch: UpdatePatientRequest = { email: 'm@x.com', phone: '11999998888' };
    expect(patch.email).toBe('m@x.com');
  });

  it('import DTOs match spec §6', () => {
    const preview: ImportPreviewResponse = {
      headers: ['Nome'],
      suggestedMapping: { Nome: 'name' },
      mappedBy: { Nome: 'template' },
      rowCount: 1,
      previewRows: [{ line: 2, values: { Nome: 'Ana' } }],
    };
    const commit: ImportCommitResponse = {
      created: 1,
      skipped: 0,
      errors: [],
    };
    expect(preview.mappedBy.Nome).toBe('template');
    expect(commit.created).toBe(1);
  });

  it('AppointmentPatientSummary reads name from the ficha', () => {
    const p: AppointmentPatientSummary = {
      id: 'p1',
      name: 'Maria',
      email: null,
      user: null,
    };
    expect(p.name).toBe('Maria');
  });
});
