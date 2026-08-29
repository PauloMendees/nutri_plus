'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Sparkles } from 'lucide-react';
import type { AiJobView } from '@nutri-plus/shared-types';
import { useAllAiJobs } from '@/lib/queries/ai-jobs';

const STORAGE_KEY = 'ai-jobs-widget:minimized';

const LABEL: Record<AiJobView['type'], { running: string; failed: string }> = {
  MEAL_PLAN_GENERATION: { running: 'Gerando plano', failed: 'Falha ao gerar o plano' },
  MEAL_PLAN_ADJUSTMENT: { running: 'Ajustando plano', failed: 'Falha ao ajustar o plano' },
};

// O painel da página do paciente mostra o mesmo estado, mas vive dentro da aba
// "Planos". Este widget existe para o caso de a nutricionista estar em qualquer
// outra tela enquanto a IA trabalha.
export function AiJobsWidget() {
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const query = useAllAiJobs();

  // Preferência lida depois da montagem, para não divergir do SSR.
  useEffect(() => {
    setMounted(true);
    try {
      setMinimized(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      // navegador sem storage: começa expandido
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(minimized));
    } catch {
      // preferência não persiste, mas a sessão respeita a escolha
    }
  }, [mounted, minimized]);

  // Jobs concluídos alimentam a faixa do editor, não são "em andamento" aqui.
  const jobs = (query.data ?? []).filter((job) => job.status !== 'DONE');

  if (!mounted || jobs.length === 0) return null;

  const running = jobs.filter((job) => job.status !== 'FAILED').length;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-lg hover:bg-muted"
      >
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        Processos de IA · {jobs.length}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto w-72 rounded-xl border bg-card shadow-lg" data-testid="ai-jobs-widget">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Processos de IA
        </p>
        <button
          type="button"
          aria-label="Minimizar processos de IA"
          onClick={() => setMinimized(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/40"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto p-3">
        {jobs.map((job) => {
          const failed = job.status === 'FAILED';
          return (
            <li key={job.id} className="text-sm">
              <Link
                href={`/patients/${job.patientId}`}
                className="flex items-start gap-2 rounded-lg p-1 hover:bg-muted/40"
              >
                {failed ? (
                  <span aria-hidden="true" className="mt-1 text-destructive">✕</span>
                ) : (
                  <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className={failed ? 'block text-destructive' : 'block'}>
                    {failed ? LABEL[job.type].failed : LABEL[job.type].running}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {job.patientName}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {running > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Você pode continuar usando o sistema — avisamos no painel do paciente.
        </p>
      )}
    </div>
  );
}
