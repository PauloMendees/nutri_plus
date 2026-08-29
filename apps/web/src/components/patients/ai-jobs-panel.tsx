'use client';

import { toast } from 'sonner';
import { AI_JOB_LABELS, isAiJobActive } from '@nutri-plus/shared-types';
import { useAiJobs, useRetryAiJob } from '@/lib/queries/ai-jobs';
import { Button } from '@/components/ui/button';

export function AiJobsPanel({ patientId }: { patientId: string }) {
  const query = useAiJobs(patientId);
  const retry = useRetryAiJob();
  // Ajustes DONE não consumidos também vêm de listForPatient — é o que alimenta
  // a faixa "Ajuste pronto" no editor. Aqui eles não são trabalho em andamento.
  const jobs = (query.data ?? []).filter(
    (job) => isAiJobActive(job.status) || job.status === 'FAILED',
  );

  // Sem trabalho em curso, o bloco não existe — não somamos ruído à tela no
  // caso comum, que é não haver nada rodando.
  if (jobs.length === 0) return null;

  async function onRetry(id: string) {
    try {
      await retry.mutateAsync(id);
      toast.success('Tentando de novo.');
    } catch {
      toast.error('Não foi possível repetir agora.');
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Processos de IA</h2>
      <ul className="mt-2 space-y-2">
        {jobs.map((job) => {
          const failed = job.status === 'FAILED';
          const canRetry = failed || job.isStuck;
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex flex-col">
                <span className={failed ? 'text-destructive' : 'text-muted-foreground'}>
                  {failed ? AI_JOB_LABELS[job.type].failed : AI_JOB_LABELS[job.type].running}
                  {job.isStuck && !failed && ' (parece travado)'}
                </span>
                {/* Motivo salvo pelo backend (ex.: cadastro incompleto) — sem isto a
                    nutricionista só vê um erro genérico que não diz o que fazer. */}
                {failed && job.error && (
                  <span className="text-xs text-muted-foreground">{job.error}</span>
                )}
              </div>
              {canRetry && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onRetry(job.id)}
                  disabled={retry.isPending}
                >
                  Tentar de novo
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
