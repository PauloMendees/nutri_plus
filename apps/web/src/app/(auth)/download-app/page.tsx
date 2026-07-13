import { Logo } from '@/components/brand/logo';

const APP_STORE_URL = 'https://apps.apple.com/br/app/inutri-pacientes/id6789184541';
const ANDROID_APK_URL =
  'https://expo.dev/accounts/paulo-mendes-tecnologia/projects/nutri-plus-mobile/builds/b5903c35-7462-4d67-8ce6-15e22d2beeea';

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true" className="h-6 w-6 shrink-0 fill-current">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C64.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 576 512" aria-hidden="true" className="h-6 w-6 shrink-0 fill-current">
      <path d="M420.55 301.93a24 24 0 1 1 24-24 24 24 0 0 1-24 24m-265.1 0a24 24 0 1 1 24-24 24 24 0 0 1-24 24m273.7-144.48 47.94-83a10 10 0 1 0-17.27-10l-48.54 84.07a301.25 301.25 0 0 0-246.56 0L116.18 64.45a10 10 0 1 0-17.27 10l47.94 83C64.53 202.22 8.24 285.55 0 384h576c-8.24-98.45-64.54-181.78-146.85-226.55" />
    </svg>
  );
}

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

      <div className="space-y-3 text-left">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-foreground transition-colors hover:border-primary/60 hover:bg-muted"
        >
          <AppleIcon />
          <span className="flex-1">
            <span className="block text-xs text-muted-foreground">Baixar na</span>
            <span className="block text-sm font-semibold">App Store</span>
          </span>
          <span className="text-xs font-medium text-primary">Abrir →</span>
        </a>

        <a
          href={ANDROID_APK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-foreground transition-colors hover:border-primary/60 hover:bg-muted"
        >
          <AndroidIcon />
          <span className="flex-1">
            <span className="block text-xs text-muted-foreground">Baixar para</span>
            <span className="block text-sm font-semibold">Android (APK)</span>
          </span>
          <span className="text-xs font-medium text-primary">Baixar →</span>
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        No Android o app é instalado fora da Play Store: ao abrir o arquivo, confirme
        &ldquo;instalar de fonte desconhecida&rdquo; se o celular solicitar.
      </p>
    </div>
  );
}
