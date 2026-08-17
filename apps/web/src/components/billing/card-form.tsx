'use client';
import { useState } from 'react';
import type { CardHolderInfo, CardInput } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';

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

type Errors = Partial<Record<keyof FormState, string>>;

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

function maskCardNumber(v: string): string {
  const d = onlyDigits(v).slice(0, 19);
  return d.replace(/(.{4})/g, '$1 ').trim();
}

function maskExpiry(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 6); // MMAAAA
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8); // 00000000
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

// Valida campo a campo e devolve mensagens amigáveis apontando o problema.
function validate(f: FormState): Errors {
  const e: Errors = {};

  const num = onlyDigits(f.number);
  if (!num) e.number = 'Informe o número do cartão.';
  else if (num.length < 13 || num.length > 19) e.number = 'Número do cartão inválido.';

  if (!f.holderName.trim()) e.holderName = 'Informe o nome como está no cartão.';

  const [mm, yyyy] = f.expiry.split('/');
  if (!f.expiry.trim()) e.expiry = 'Informe a validade.';
  else if (!/^\d{2}$/.test(mm ?? '') || !/^\d{4}$/.test(yyyy ?? '')) e.expiry = 'Use o formato MM/AAAA.';
  else {
    const m = Number(mm);
    const y = Number(yyyy);
    const now = new Date();
    if (m < 1 || m > 12) e.expiry = 'Mês inválido (01 a 12).';
    else if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1)) e.expiry = 'Cartão vencido.';
  }

  const ccv = onlyDigits(f.ccv);
  if (!ccv) e.ccv = 'Informe o CVV.';
  else if (ccv.length < 3 || ccv.length > 4) e.ccv = 'CVV inválido (3 ou 4 dígitos).';

  const cpf = onlyDigits(f.cpf);
  if (!cpf) e.cpf = 'Informe o CPF.';
  else if (cpf.length !== 11) e.cpf = 'CPF inválido (11 dígitos).';

  const cep = onlyDigits(f.cep);
  if (!cep) e.cep = 'Informe o CEP.';
  else if (cep.length !== 8) e.cep = 'CEP inválido (8 dígitos).';

  if (!f.addressNumber.trim()) e.addressNumber = 'Informe o número do endereço.';

  const phone = onlyDigits(f.phone);
  if (!phone) e.phone = 'Informe o telefone.';
  else if (phone.length < 10 || phone.length > 11) e.phone = 'Telefone inválido (com DDD).';

  return e;
}

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
  const [errors, setErrors] = useState<Errors>({});

  const set = (k: keyof FormState, transform?: (v: string) => string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = transform ? transform(e.target.value) : e.target.value;
    setF((prev) => ({ ...prev, [k]: value }));
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  function submit() {
    const errs = validate(f);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
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

  const Field = (
    label: string,
    k: keyof FormState,
    opts?: { placeholder?: string; transform?: (v: string) => string; inputMode?: 'numeric' | 'text' },
  ) => (
    <label className="block text-sm">
      {label}
      <input
        aria-label={label}
        className="mt-1 w-full rounded border px-3 py-2"
        value={f[k]}
        onChange={set(k, opts?.transform)}
        placeholder={opts?.placeholder}
        inputMode={opts?.inputMode}
        aria-invalid={errors[k] ? true : undefined}
      />
      {errors[k] && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {errors[k]}
        </span>
      )}
    </label>
  );

  return (
    <div className="mx-auto max-w-sm space-y-3">
      {Field('Número do cartão', 'number', {
        placeholder: '0000 0000 0000 0000',
        transform: maskCardNumber,
        inputMode: 'numeric',
      })}
      {Field('Nome no cartão', 'holderName')}
      <div className="grid grid-cols-2 gap-3">
        {Field('Validade', 'expiry', { placeholder: 'MM/AAAA', transform: maskExpiry, inputMode: 'numeric' })}
        {Field('CVV', 'ccv', { inputMode: 'numeric' })}
      </div>
      {Field('CPF', 'cpf', { inputMode: 'numeric' })}
      <div className="grid grid-cols-2 gap-3">
        {Field('CEP', 'cep', { placeholder: '00000-000', transform: maskCep, inputMode: 'numeric' })}
        {Field('Número (endereço)', 'addressNumber', { inputMode: 'numeric' })}
      </div>
      {Field('Telefone', 'phone', { inputMode: 'numeric' })}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" className="w-full" size="lg" disabled={loading} onClick={submit}>
        {loading ? 'Processando…' : 'Pagar'}
      </Button>
    </div>
  );
}
