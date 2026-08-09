'use client';

import { useEffect, useState } from 'react';
import { CtaLink } from './cta-link';

/** Fixed bottom bar on small screens after scrolling past the hero. */
export function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <CtaLink className="w-full justify-center shadow-lg shadow-primary/20">
        Testar 7 dias grátis
      </CtaLink>
    </div>
  );
}
