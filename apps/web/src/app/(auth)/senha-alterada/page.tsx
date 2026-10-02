import { Logo } from '@/components/brand/logo';
import { AppStoreLinks } from '@/components/auth/app-store-links';

// Destino do paciente depois de trocar a senha pelo link do e-mail: ele não
// tem acesso ao web, então o caminho de volta é o app (esquema `nutriplus://`
// de apps/mobile/app.config.js), com as lojas para quem está no computador.
const APP_LINK = 'nutriplus://login';

export default function PasswordChangedPage() {
  return (
    <div className="space-y-6 text-center">
      <Logo variant="icon" className="mx-auto h-12" />

      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-bold text-foreground">Senha alterada!</h2>
        <p className="text-sm text-muted-foreground">Entre no app do iNutri com a nova senha.</p>
      </div>

      <a
        href={APP_LINK}
        className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Abrir o app
      </a>

      <p className="text-xs text-muted-foreground">Ainda não tem o app ou está no computador?</p>
      <AppStoreLinks />
    </div>
  );
}
