import { cn } from '@/lib/utils';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function PatientAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={cn('shrink-0 rounded-full object-cover', className)} />;
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
