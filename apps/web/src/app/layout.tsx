import type { Metadata } from 'next';
import { Sora, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Variable fonts (omit weight) keep a single woff2 per family — smaller than multi-static.
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://inutri.life';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'iNutri',
    template: '%s · iNutri',
  },
  description:
    'Software para nutricionistas: planos com IA, app do paciente e consultório em um só lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${sora.variable} ${jakarta.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
