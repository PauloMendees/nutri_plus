import { useCallback, useEffect, useState } from 'react';

// Diz se o conteúdo de um contêiner com rolagem horizontal é mais largo que ele
// (ou seja, se a barra de rolagem aparece). Remede quando o contêiner ou o seu
// primeiro filho mudam de tamanho — redimensionar a janela, chegar mais linhas.
export function useHorizontalOverflow<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [node]);

  return [ref, overflowing] as const;
}
