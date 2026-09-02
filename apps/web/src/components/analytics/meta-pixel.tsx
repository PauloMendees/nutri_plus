'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function MetaPixel({
  pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID,
  trackPageView = true,
}: {
  pixelId?: string;
  /**
   * `false` inicializa o pixel sem contar PageView. É o modo usado dentro do
   * app autenticado: o pixel precisa existir para `trackCustom('TrialAtivado')`
   * ter onde disparar, mas a navegação interna do produto não é audiência de
   * campanha e não deve inflar o volume de PageView.
   */
  trackPageView?: boolean;
}) {
  const pathname = usePathname();
  const isFirstPath = useRef(true);

  useEffect(() => {
    if (isFirstPath.current) {
      isFirstPath.current = false;
      return;
    }
    if (!trackPageView) return;
    window.fbq?.('track', 'PageView');
  }, [pathname, trackPageView]);

  if (!pixelId) return null;

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
${trackPageView ? "fbq('track', 'PageView');" : ''}
          `.trim(),
        }}
      />
      {trackPageView && (
        <noscript>
          <img
            height={1}
            width={1}
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      )}
    </>
  );
}
