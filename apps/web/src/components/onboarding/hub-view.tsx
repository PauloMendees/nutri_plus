"use client";

import { Lock, Play } from "lucide-react";
import {
  UserRole,
  type Entitlements,
  type OnboardingTourProgressView,
} from "@nutri-plus/shared-types";
import { ALL_TOURS, type TourDefinition } from "@/lib/onboarding/catalog";
import {
  chapterView,
  continuePlayChapterId,
  isDemoPlayRecovery,
  primaryCta,
} from "@/lib/onboarding/progress";
import { useOnboarding } from "@/lib/queries/onboarding";
import { useSubscription } from "@/lib/queries/subscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DeleteDemoAppointmentBanner,
  DeleteDemoBanner,
  DeleteDemoTransactionBanner,
} from "./delete-demo-banner";
import { useTour } from "./tour-provider";

const CHAPTER_STATUS_LABEL = {
  todo: "A fazer",
  in_progress: "Em andamento",
  completed: "Concluído",
  skipped: "Pulado",
  locked: "Bloqueado",
} as const;

function aiLockCopy(entitlements: Entitlements | undefined): string {
  if (
    entitlements &&
    !entitlements.isReadOnly &&
    entitlements.aiUsed >= entitlements.aiQuota
  ) {
    return "Cota de IA esgotada.";
  }
  return "Disponível no plano Pro.";
}

function lockReasonText(
  lockReason: "ai" | "demo" | null,
  entitlements: Entitlements | undefined,
): string {
  if (lockReason === "ai") return aiLockCopy(entitlements);
  if (lockReason === "demo")
    return "Cadastre o paciente de demonstração primeiro.";
  return "Este capítulo está bloqueado.";
}

function TourDemoBanner({
  def,
  tour,
}: {
  def: TourDefinition;
  tour: OnboardingTourProgressView | undefined;
}) {
  if (!tour) return null;
  if (def.id === "patients" && tour.demoPatientId) {
    return <DeleteDemoBanner patientId={tour.demoPatientId} />;
  }
  if (def.id === "agenda" && tour.demoAppointmentId) {
    return <DeleteDemoAppointmentBanner appointmentId={tour.demoAppointmentId} />;
  }
  if (def.id === "contabilidade" && tour.demoTransactionId) {
    return <DeleteDemoTransactionBanner transactionId={tour.demoTransactionId} />;
  }
  return null;
}

function TourCard({
  def,
  tour,
  role,
  entitlements,
}: {
  def: TourDefinition;
  tour: OnboardingTourProgressView | undefined;
  role: UserRole | null;
  entitlements: Entitlements | undefined;
}) {
  const { start } = useTour();
  const cta = primaryCta(tour);
  const canStart = role != null && def.canStart(role);
  const playChapterId = continuePlayChapterId(def, tour, entitlements);
  const replayChapterId = def.chapters.find((chapter) => {
    const { status } = chapterView(chapter, tour, entitlements);
    return status === "completed" || status === "skipped";
  })?.id;

  function play(chapterId: string | null, replay = false) {
    if (!canStart || !chapterId) return;
    const chapter = def.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    const recovering = isDemoPlayRecovery(def, chapter, tour);
    if (status === "locked") return;
    if ((status === "completed" || status === "skipped") && !replay && !recovering)
      return;
    start({ tourId: def.id, chapterId, replay });
  }

  function replay(chapterId: string) {
    play(chapterId, true);
  }

  function playChapter(chapterId: string) {
    const chapter = def.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    if (status === "completed" || status === "skipped") {
      replay(chapterId);
      return;
    }
    play(chapterId, false);
  }

  return (
    <Card data-testid={`tour-card-${def.id}`}>
      <CardHeader>
        <CardTitle>{def.title}</CardTitle>
        <CardDescription>{def.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TourDemoBanner def={def} tour={tour} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {def.chapters.map((chapter) => {
            const view = chapterView(chapter, tour, entitlements);
            const canReplay =
              canStart &&
              (view.status === "completed" || view.status === "skipped");
            const canPlayNow =
              canStart &&
              view.status !== "locked" &&
              (view.status === "todo" ||
                view.status === "in_progress" ||
                view.status === "completed" ||
                view.status === "skipped" ||
                isDemoPlayRecovery(def, chapter, tour));
            const reason =
              view.status === "locked"
                ? lockReasonText(view.lockReason, entitlements)
                : null;
            return (
              <Card
                key={chapter.id}
                size="sm"
                data-chapter={chapter.id}
                className="gap-2 py-3"
              >
                <CardHeader className="px-3">
                  <CardTitle className="text-sm">{chapter.title}</CardTitle>
                  <CardDescription>
                    {view.status === "locked" && reason ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center gap-1">
                            <Lock className="h-3.5 w-3.5" aria-hidden />
                            {CHAPTER_STATUS_LABEL[view.status]}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{reason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      CHAPTER_STATUS_LABEL[view.status]
                    )}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex items-center justify-between px-3 pb-3">
                  {canReplay ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => replay(chapter.id)}
                    >
                      Rever
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="size-8 rounded-full p-0"
                    disabled={!canPlayNow}
                    aria-label={`Iniciar ${chapter.title}`}
                    onClick={() => playChapter(chapter.id)}
                  >
                    <Play className="size-3.5 fill-current" aria-hidden />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        {cta === "start" ? (
          <Button
            type="button"
            disabled={!canStart || !playChapterId}
            onClick={() => play(playChapterId)}
          >
            Começar
          </Button>
        ) : null}
        {cta === "continue" ? (
          <Button
            type="button"
            disabled={!canStart || !playChapterId}
            onClick={() => play(playChapterId)}
          >
            Continuar
          </Button>
        ) : null}
        {cta === "review" ? (
          <>
            <Badge>Concluído</Badge>
            <Button
              className="ml-auto"
              type="button"
              disabled={!canStart || !replayChapterId}
              onClick={() => replayChapterId && replay(replayChapterId)}
            >
              Rever
            </Button>
          </>
        ) : null}
        {!canStart && role != null ? (
          <p className="text-sm text-muted-foreground">
            {def.startLockedText ?? "Este tutorial é feito pelo nutricionista."}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function HubView({ role }: { role: UserRole | null }) {
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const entitlements = subscription?.entitlements;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold">Primeiros passos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tutoriais guiados pelos módulos do iNutri. Cada capítulo destaca a
            tela certa: clique no que está iluminado ou em Próximo. Você pode
            pular, sair e rever quando quiser.
          </p>
        </div>
        {ALL_TOURS.map((def) => (
          <TourCard
            key={def.id}
            def={def}
            tour={onboarding?.tours.find((row) => row.tourId === def.id)}
            role={role}
            entitlements={entitlements}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
