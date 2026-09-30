import { patientExportFileName } from '@nutri-plus/shared-types';
import { buildPatientDeletedEmail } from './patient-deleted-email';

describe('patientExportFileName', () => {
  it('slugs the name without accents and dates it in São Paulo', () => {
    // 30/09 22:00 em São Paulo == 01/10 01:00 UTC.
    expect(patientExportFileName('  Lúcia Ferreira D’Ávila ', new Date('2026-10-01T01:00:00.000Z'))).toBe(
      'dados-lucia-ferreira-d-avila-2026-09-30.json',
    );
  });
});

describe('buildPatientDeletedEmail', () => {
  const mail = buildPatientDeletedEmail({
    patientName: 'maria silva',
    nutritionistName: 'Dra. Ana <Souza>',
    fileName: 'dados-maria-silva-2026-09-30.json',
  });

  it('names the nutritionist in the subject', () => {
    expect(mail.subject).toBe('Seus dados no iNutri — cadastro encerrado por Dra. Ana <Souza>');
  });

  it('greets by first name and explains the deletion, the file and the LGPD right', () => {
    expect(mail.text).toContain('Olá, Maria.');
    expect(mail.text).toContain('Dra. Ana <Souza> encerrou o seu cadastro no iNutri');
    expect(mail.text).toContain('dados-maria-silva-2026-09-30.json');
    expect(mail.text).toContain('Lei 13.709/2018, art. 18');
    expect(mail.text).toContain('responda este e-mail');
  });

  it('lists exactly what the copy includes, and says audio and photo are not in it', () => {
    expect(mail.text).toContain('uma cópia dos seus dados');
    expect(mail.text).not.toContain('cópia de tudo');
    expect(mail.text).toContain('pedidos de sugestão fora de casa');
    expect(mail.text).toContain('transcrições de consultas');
    expect(mail.text).toMatch(/gravações de áudio[^.]*foto de perfil[^.]*não estão incluídas/);
  });

  it('escapes names in the HTML version', () => {
    expect(mail.html).toContain('Dra. Ana &lt;Souza&gt;');
    expect(mail.html).not.toContain('<Souza>');
  });
});
