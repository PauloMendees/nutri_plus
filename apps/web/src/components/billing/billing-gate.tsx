'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';
import { onBilling } from '@/lib/billing/billing-events';
import { useSubscription } from '@/lib/queries/subscription';

const MODAL_COPY: Record<Exclude<BillingErrorCode, 'READ_ONLY'>, { title: string; body: string }> = {
  AI_QUOTA_EXCEEDED: { title: 'Cota de IA esgotada', body: 'Você usou suas ações de IA deste mês. Faça upgrade para o Pro ou aguarde a renovação no dia 1º.' },
  FEATURE_PRO_ONLY: { title: 'Recurso do plano Pro', body: 'Esse recurso está disponível no plano Pro. Faça upgrade para liberar.' },
  SEAT_LIMIT: { title: 'Limite de funcionários', body: 'Seu plano atingiu o limite de assentos. Faça upgrade para adicionar mais.' },
};

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

export function BillingGate() {
  const router = useRouter();
  const { data } = useSubscription();
  const [modal, setModal] = useState<{ code: Exclude<BillingErrorCode, 'READ_ONLY'>; feature?: PlanFeature } | null>(null);

  useEffect(() => {
    return onBilling((e) => {
      if (e.code === 'READ_ONLY') router.push('/assinatura');
      else setModal({ code: e.code, feature: e.feature });
    });
  }, [router]);

  const isReadOnly = data?.entitlements.isReadOnly;
  const showTrial = data && !isReadOnly && data.status === 'TRIALING' && data.trialEndsAt;

  return (
    <>
      {isReadOnly && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-2 text-sm text-center">
          Sua conta está em <strong>somente leitura</strong>. <a href="/assinatura" className="underline font-medium">Assine</a> para voltar a editar.
        </div>
      )}
      {showTrial && (
        <div className="bg-primary/10 text-primary px-4 py-2 text-sm text-center">
          Seu teste termina em <strong>{daysUntil(data!.trialEndsAt!)} dia(s)</strong>. <a href="/assinatura" className="underline font-medium">Assinar</a>
        </div>
      )}
      {modal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">{MODAL_COPY[modal.code].title}</h2>
            <p className="text-sm text-muted-foreground">{MODAL_COPY[modal.code].body}</p>
            <div className="flex justify-end gap-2">
              <button className="text-sm px-3 py-2" onClick={() => setModal(null)}>Fechar</button>
              <button className="text-sm px-3 py-2 rounded bg-primary text-primary-foreground" onClick={() => { setModal(null); router.push('/assinatura'); }}>Ver planos</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
