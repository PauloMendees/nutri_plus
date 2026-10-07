import { Mail } from 'lucide-react';

// Aviso fixo depois de enviar um e-mail ao próprio usuário: muitos provedores
// mandam o primeiro e-mail do iNutri para o spam.
export function SpamHint() {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5 text-left text-sm text-foreground">
      <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        Não encontrou o e-mail? Confira também a caixa de <strong>spam</strong> ou de{' '}
        <strong>lixo eletrônico</strong>.
      </span>
    </p>
  );
}
