export function canonicalizeWhatsappNumber(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  // Com "+" o DDI é explícito: não presumir Brasil (um +1 tem 11 dígitos).
  if (input.trim().startsWith('+')) {
    if (digits.startsWith('55')) {
      if (digits.length === 12 || digits.length === 13) return digits;
      throw new Error('invalid');
    }
    if (digits.length >= 8 && digits.length <= 15) return digits;
    throw new Error('invalid');
  }
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  throw new Error('invalid');
}

// Non-throwing variant: null for empty *or* invalid input.
export function tryCanonicalizeWhatsappNumber(input: string | null | undefined): string | null {
  try {
    return canonicalizeWhatsappNumber(input);
  } catch {
    return null;
  }
}

export function whatsappMeUrl(canonicalDigits: string): string {
  return `https://wa.me/${canonicalDigits}`;
}
