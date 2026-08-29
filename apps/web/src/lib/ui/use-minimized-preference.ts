'use client';

import { useEffect, useState } from 'react';

// Preferência "minimizado" de widget de canto, persistida por viewer. Lida só
// após a montagem para não divergir do SSR — o servidor não tem localStorage.
// Extraída porque as duas cópias já haviam divergido: uma protegia o acesso ao
// storage com try/catch e a outra lançava em navegador com storage bloqueado.
export function useMinimizedPreference(storageKey: string) {
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setMinimized(window.localStorage.getItem(storageKey) === 'true');
    } catch {
      // navegador sem storage: começa expandido
    }
  }, [storageKey]);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(storageKey, String(minimized));
    } catch {
      // preferência não persiste, mas a sessão respeita a escolha
    }
  }, [mounted, minimized, storageKey]);

  return { mounted, minimized, setMinimized };
}
