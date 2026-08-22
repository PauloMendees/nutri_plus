'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { UserRole, type Entitlements } from '@nutri-plus/shared-types';
import { canManagePatients } from '@/lib/auth/access';
import { PATIENTS_TOUR } from '@/lib/onboarding/catalog';
import { chapterView, firstIncompleteChapterId, primaryCta } from '@/lib/onboarding/progress';
import { useOnboarding } from '@/lib/queries/onboarding';
import { useSubscription } from '@/lib/queries/subscription';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DeleteDemoBanner } from './delete-demo-banner';
import { useTour } from './tour-provider';

const CHAPTER_STATUS_LABEL = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  skipped: 'Pulado',
  locked: 'Cadeado',
} as const;

function aiLockCopy(entitlements: Entitlements | undefined): string {
  if (entitlements && !entitlements.isReadOnly && entitlements.aiUsed >= entitlements.aiQuota) {
    return 'Cota de IA esgotada.';
  }
  return 'Disponível no plano Pro.';
}

export function HubView({ role }: { role: UserRole | null }) {
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const { start } = useTour();

  const entitlements = subscription?.entitlements;
  const tour = onboarding?.tours.find((row) => row.tourId === PATIENTS_TOUR.id);
  const cta = primaryCta(tour);
  const canStart = role != null && canManagePatients(role);
  const playChapterId = firstIncompleteChapterId(PATIENTS_TOUR, tour, entitlements);
  const replayChapterId = PATIENTS_TOUR.chapters.find((chapter) => {
    const { status } = chapterView(chapter, tour, entitlements);
    return status === 'completed' || status === 'skipped';
  })?.id;

  function play(chapterId: string | null) {
    if (!canStart || !chapterId) return;
    const chapter = PATIENTS_TOUR.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    if (status === 'locked' || status === 'completed' || status === 'skipped') return;
    start({ tourId: 'patients', chapterId, replay: false });
  }

  function replay(chapterId: string) {
    if (!canStart) return;
    const chapter = PATIENTS_TOUR.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    if (status !== 'completed' && status !== 'skipped') return;
    start({ tourId: 'patients', chapterId, replay: true });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Primeiros passos</h1>
      </div>

      {tour?.demoPatientId ? <DeleteDemoBanner patientId={tour.demoPatientId} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{PATIENTS_TOUR.title}</CardTitle>
          <CardDescription>{PATIENTS_TOUR.summary}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol>
            {PATIENTS_TOUR.chapters.map((chapter) => {
              const view = chapterView(chapter, tour, entitlements);
              const canReplay =
                canStart && (view.status === 'completed' || view.status === 'skipped');
              return (
                <li
                  key={chapter.id}
                  className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{chapter.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {view.status === 'locked' ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
                      {CHAPTER_STATUS_LABEL[view.status]}
                    </p>
                    {view.lockReason === 'ai' ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {aiLockCopy(entitlements)}{' '}
                        <Link href="/assinatura" className="font-medium text-primary underline">
                          Ver assinatura
                        </Link>
                      </p>
                    ) : null}
                    {view.lockReason === 'demo' ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cadastre o paciente de demonstração primeiro.
                      </p>
                    ) : null}
                  </div>
                  {canReplay ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => replay(chapter.id)}>
                      Rever
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3">
          {cta === 'start' ? (
            <Button type="button" disabled={!canStart || !playChapterId} onClick={() => play(playChapterId)}>
              Começar
            </Button>
          ) : null}
          {cta === 'continue' ? (
            <Button type="button" disabled={!canStart || !playChapterId} onClick={() => play(playChapterId)}>
              Continuar
            </Button>
          ) : null}
          {cta === 'review' ? (
            <>
              <Badge>Concluído</Badge>
              <Button
                type="button"
                disabled={!canStart || !replayChapterId}
                onClick={() => replayChapterId && replay(replayChapterId)}
              >
                Rever
              </Button>
            </>
          ) : null}
          {role === UserRole.EMPLOYEE ? (
            <p className="text-sm text-muted-foreground">
              Este tutorial é feito pelo nutricionista (cadastro de pacientes).
            </p>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
