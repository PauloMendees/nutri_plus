/**
 * Máscara progressiva de telefone brasileiro (DDD + 8 ou 9 dígitos) para
 * inputs controlados: (00) 0000-0000 ou (00) 00000-0000.
 *
 * Reaplicar sobre um valor já mascarado devolve o mesmo valor, o que permite
 * chamar em todo `onChange` sem acumular separadores.
 */
export function maskPhoneBr(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);

  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (rest.length <= 5) return `${ddd}${rest}`;
  // 8 dígitos (fixo) quebra em 4-4; 9 dígitos (celular) em 5-4.
  const split = rest.length === 9 ? 5 : 4;
  return `${ddd}${rest.slice(0, split)}-${rest.slice(split)}`;
}

/**
 * Máscara do número nacional conforme o DDI: a brasileira para +55 e só
 * dígitos para os demais, limitados ao total de 15 do E.164.
 */
export function maskWhatsappNational(value: string, countryCode: string): string {
  if (countryCode === '+55') return maskPhoneBr(value);
  const ccDigits = countryCode.replace(/\D/g, '').length;
  return value.replace(/\D/g, '').slice(0, 15 - ccDigits);
}
