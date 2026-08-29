'use client';

import Link from 'next/link';
import { Loader2, Minus, Sparkles } from 'lucide-react';
import { AI_JOB_LABELS, isAiJobActive } from '@nutri-plus/shared-types';
import { useAllAiJobs } from '@/lib/queries/ai-jobs';
import { useMinimizedPreference } from '@/lib/ui/use-minimized-preference';

const STORAGE_KEY = 'ai-jobs-widget:minimized';

// O painel da página do paciente mostra o mesmo estado, mas vive dentro da aba
// "Planos". Este widget existe para o caso de a nutricionista estar em qualquer
// outra tela enquanto a IA trabalha.
export function AiJobsWidget() {
  const { mounted, minimized, setMinimized } = useMinimizedPreference(STORAGE_KEY);
  const query = useAllAiJobs();

  // Concluídos alimentam a faixa do editor, não são trabalho em andamento aqui.
  const jobs = (query.data ?? []).filter(
    (job) => isAiJobActive(job.status) || job.status === 'FAILED',
  );

  if (!mounted || jobs.length === 0) return null;

  const running = jobs.filter((job) => isAiJobActive(job.status)).length;

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
                    {failed ? AI_JOB_LABELS[job.type].failed : AI_JOB_LABELS[job.type].running}
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
