import {
  parseActivityLevel,
  parseDateCell,
  parseDecimal,
  parseEmail,
  parseGender,
  parseHeightCm,
  parseObjective,
  parsePhoneCell,
} from './import-parsers';

describe('import-parsers', () => {
  it('height 1,65 → 165', () => {
    expect(parseHeightCm('1,65')).toBe(165);
  });

  it('height 165 stays cm', () => {
    expect(parseHeightCm('165')).toBe(165);
  });

  it('parses BR decimal', () => {
    expect(parseDecimal('70,5')).toBe(70.5);
    expect(parseDecimal('')).toBeNull();
  });

  it('parses BR date', () => {
    expect(parseDateCell('12/03/1990')?.toISOString().slice(0, 10)).toBe('1990-03-12');
  });

  it('parses ISO date', () => {
    expect(parseDateCell('1990-03-12')?.toISOString().slice(0, 10)).toBe('1990-03-12');
  });

  it('parses excel serial date', () => {
    // 12/03/1990 in Excel 1900 system ≈ 32944
    expect(parseDateCell(32944)?.toISOString().slice(0, 10)).toBe('1990-03-12');
  });

  it('rejects future date', () => {
    expect(parseDateCell('12/03/2999')).toBeNull();
  });

  it('parses F/Feminino', () => {
    expect(parseGender('F')).toBe('FEMALE');
    expect(parseGender('Feminino')).toBe('FEMALE');
  });

  it('parses M/Masculino/Homem', () => {
    expect(parseGender('M')).toBe('MALE');
    expect(parseGender('Masculino')).toBe('MALE');
    expect(parseGender('Homem')).toBe('MALE');
  });

  it('parses emagrecer → WEIGHT_LOSS', () => {
    expect(parseObjective('emagrecer')).toBe('WEIGHT_LOSS');
  });

  it('parses objective labels and aliases', () => {
    expect(parseObjective('Perda de peso')).toBe('WEIGHT_LOSS');
    expect(parseObjective('hipertrofia')).toBe('MUSCLE_GAIN');
    expect(parseObjective('manter')).toBe('MAINTENANCE');
  });

  it('parses activity labels', () => {
    expect(parseActivityLevel('Sedentário')).toBe('SEDENTARY');
    expect(parseActivityLevel('Moderado')).toBe('MODERATE');
  });

  it('parseEmail empty → null; invalid throws', () => {
    expect(parseEmail('')).toBeNull();
    expect(parseEmail('  ')).toBeNull();
    expect(parseEmail('  Foo@Example.COM ')).toBe('foo@example.com');
    expect(() => parseEmail('not-an-email')).toThrow('invalid-email');
  });

  it('parsePhoneCell canonicalizes; invalid throws', () => {
    expect(parsePhoneCell('')).toBeNull();
    expect(parsePhoneCell('11999887766')).toBe('5511999887766');
    expect(() => parsePhoneCell('123')).toThrow('invalid');
  });
});
