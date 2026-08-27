/**
 * Máscara progressiva de CPF/CNPJ para inputs controlados.
 *
 * O campo do checkout aceita os dois documentos (a API valida 11 ou 14
 * dígitos), então a máscara troca de formato no 12º dígito em vez de travar
 * em 11 como o `maskCpf` do formulário de cartão — que é só CPF.
 *
 * Reaplicar sobre um valor já mascarado devolve o mesmo valor, o que permite
 * chamar em todo `onChange` sem acumular separadores.
 */
export function maskCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);

  if (d.length <= 11) {
    // CPF: 000.000.000-00
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  // CNPJ: 00.000.000/0000-00
  const head = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}`;
  return d.length > 12 ? `${head}-${d.slice(12)}` : head;
}
