'use client';
import { useState } from 'react';
import type { CardHolderInfo, CardInput } from '@nutri-plus/shared-types';

type FormState = {
  number: string;
  holderName: string;
  expiry: string;
  ccv: string;
  cpf: string;
  cep: string;
  addressNumber: string;
  phone: string;
};

const INITIAL_STATE: FormState = {
  number: '',
  holderName: '',
  expiry: '',
  ccv: '',
  cpf: '',
  cep: '',
  addressNumber: '',
  phone: '',
};

const onlyDigits = (s: string) => s.replace(/\D/g, '');

export function CardForm({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (card: CardInput, holderInfo: CardHolderInfo, cpfCnpj: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [f, setF] = useState<FormState>(INITIAL_STATE);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function submit() {
    const [mm, yyyy] = f.expiry.split('/').map((s) => s.trim());
    onSubmit(
      {
        holderName: f.holderName.trim(),
        number: onlyDigits(f.number),
        expiryMonth: mm ?? '',
        expiryYear: yyyy ?? '',
        ccv: onlyDigits(f.ccv),
      },
      {
        postalCode: onlyDigits(f.cep),
        addressNumber: f.addressNumber.trim(),
        phone: onlyDigits(f.phone),
      },
      onlyDigits(f.cpf),
    );
  }

  const Input = (label: string, k: keyof FormState, placeholder?: string) => (
    <label className="block text-sm">
      {label}
      <input
        aria-label={label}
        className="mt-1 w-full rounded border px-3 py-2"
        value={f[k]}
        onChange={set(k)}
        placeholder={placeholder}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-sm space-y-3">
      {Input('Número do cartão', 'number')}
      {Input('Nome no cartão', 'holderName')}
      <div className="grid grid-cols-2 gap-3">
        {Input('Validade', 'expiry', 'MM/AAAA')}
        {Input('CVV', 'ccv')}
      </div>
      {Input('CPF', 'cpf')}
      <div className="grid grid-cols-2 gap-3">
        {Input('CEP', 'cep')}
        {Input('Número (endereço)', 'addressNumber')}
      </div>
      {Input('Telefone', 'phone')}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        disabled={loading}
        onClick={submit}
      >
        {loading ? 'Processando…' : 'Pagar'}
      </button>
    </div>
  );
}
