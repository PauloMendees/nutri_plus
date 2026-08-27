import { describe, it, expect } from 'vitest';
import { maskCpfCnpj } from './cpf-cnpj';

describe('maskCpfCnpj', () => {
  it('formata CPF progressivamente conforme se digita', () => {
    expect(maskCpfCnpj('7')).toBe('7');
    expect(maskCpfCnpj('707')).toBe('707');
    expect(maskCpfCnpj('7079')).toBe('707.9');
    expect(maskCpfCnpj('707919')).toBe('707.919');
    expect(maskCpfCnpj('7079194')).toBe('707.919.4');
    expect(maskCpfCnpj('707919441')).toBe('707.919.441');
    expect(maskCpfCnpj('70791944158')).toBe('707.919.441-58');
  });

  it('passa para o formato de CNPJ a partir do 12o digito', () => {
    expect(maskCpfCnpj('123456789012')).toBe('12.345.678/9012');
    expect(maskCpfCnpj('12345678901234')).toBe('12.345.678/9012-34');
  });

  it('nao trunca CNPJ em 11 digitos (regressao: maskCpf do card-form faz isso)', () => {
    expect(maskCpfCnpj('12345678901234').replace(/\D/g, '')).toHaveLength(14);
  });

  it('descarta o excedente acima de 14 digitos', () => {
    expect(maskCpfCnpj('123456789012349999')).toBe('12.345.678/9012-34');
  });

  it('e idempotente sobre um valor ja mascarado (o input remascara a cada tecla)', () => {
    expect(maskCpfCnpj('707.919.441-58')).toBe('707.919.441-58');
    expect(maskCpfCnpj('12.345.678/9012-34')).toBe('12.345.678/9012-34');
  });

  it('ignora letras e simbolos colados', () => {
    expect(maskCpfCnpj('707abc919-441/58')).toBe('707.919.441-58');
    expect(maskCpfCnpj('')).toBe('');
  });

  it('permite apagar: remover um digito nao reintroduz o separador final', () => {
    // usuario apaga o "8" de 707.919.441-58 -> o valor volta a 707.919.441-5
    expect(maskCpfCnpj('707.919.441-5')).toBe('707.919.441-5');
    // e apagando o "5" tambem, o hifen nao deve sobrar
    expect(maskCpfCnpj('707.919.441')).toBe('707.919.441');
  });
});
