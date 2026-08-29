import { AiJobsWidget } from '@/components/ai/ai-jobs-widget';
import { TodayAgendaWidget } from '@/components/agenda/today-agenda-widget';

// Canto inferior direito, empilhado. Cada widget decide se aparece; o contêiner
// só cuida de posição e de não bloquear cliques onde não há widget.
export function CornerWidgets() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 hidden flex-col items-end gap-2 md:flex">
      <AiJobsWidget />
      <TodayAgendaWidget />
    </div>
  );
}
