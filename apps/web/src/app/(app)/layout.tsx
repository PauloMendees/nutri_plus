import { Logo } from '@/components/brand/logo';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <Logo variant="full" className="h-7" />
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
