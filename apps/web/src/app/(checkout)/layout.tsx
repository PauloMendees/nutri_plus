import { Logo } from '@/components/brand/logo';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex justify-center border-b p-4">
        <Logo variant="full" className="h-7" />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">{children}</main>
    </div>
  );
}
