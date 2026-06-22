'use client';

import { Button } from '@/components/ui/button';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="font-heading text-2xl font-bold text-foreground">Algo deu errado</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Não foi possível carregar seus dados. Tente novamente em instantes.
      </p>
      <Button className="mt-6 rounded-full" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  );
}
