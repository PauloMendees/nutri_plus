export interface MonthDay {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// month is 0-based (JS Date convention). 42 cells, Sunday-first.
export function monthGrid(year: number, month: number, today: Date = new Date()): MonthDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay()); // back up to Sunday
  const cells: MonthDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month, isToday: sameDay(date, today) });
  }
  return cells;
}

export function gridRange(year: number, month: number): { from: Date; to: Date } {
  const grid = monthGrid(year, month);
  const first = grid[0].date;
  const last = grid[grid.length - 1].date;
  return {
    from: startOfDay(first),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
  };
}

export function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatMonthTitle(year: number, month: number): string {
  // Format the month name alone and append the year — locale-agnostic, avoids
  // the pt-BR "junho de 2026" connector (and any ICU format-string variance).
  const name = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function formatDayHeading(d: Date): string {
  const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Displays the time in the viewer's local timezone (correct for a local calendar).
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatTimeRange(startISO: string, endISO: string): string {
  return `${formatTime(startISO)}–${formatTime(endISO)}`;
}

export function groupByDay<T extends { startsAt: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = toDateInput(new Date(item.startsAt));
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
