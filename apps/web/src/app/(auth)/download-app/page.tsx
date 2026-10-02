import { Logo } from '@/components/brand/logo';
import { AppStoreLinks } from '@/components/auth/app-store-links';

export default function DownloadAppPage() {
  return (
    <div className="space-y-6 text-center">
      <Logo variant="icon" className="mx-auto h-12" />

      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-bold text-foreground">Tudo pronto! 🎉</h2>
        <p className="text-sm text-muted-foreground">
          O iNutri para pacientes fica no seu celular — baixe o app para acessar seus planos,
          avaliações e acompanhamento.
        </p>
      </div>

      <AppStoreLinks />
    </div>
  );
}
