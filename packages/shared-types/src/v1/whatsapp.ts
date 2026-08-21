export function canonicalizeWhatsappNumber(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  throw new Error('invalid');
}

export function whatsappMeUrl(canonicalDigits: string): string {
  return `https://wa.me/${canonicalDigits}`;
}
