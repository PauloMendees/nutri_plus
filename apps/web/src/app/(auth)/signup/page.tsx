import { Suspense } from 'react';
import { SignupForm } from '@/components/auth/signup-form';
import { MetaPixel } from '@/components/analytics/meta-pixel';

export default function SignupPage() {
  return (
    <>
      {/* Funil de aquisição: só nutricionista chega aqui (paciente é convidado). */}
      <MetaPixel />
      <Suspense>
        <SignupForm />
      </Suspense>
    </>
  );
}
