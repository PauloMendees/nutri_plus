import { AuthLayout } from '@/components/auth/auth-layout';
import { MetaPixel } from '@/components/analytics/meta-pixel';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MetaPixel />
      <AuthLayout>{children}</AuthLayout>
    </>
  );
}
