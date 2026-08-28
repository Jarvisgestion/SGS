import { useEffect, useState } from 'react';

/** Router mínimo sobre el hash: la app tiene pocas pantallas y así no suma dependencias. */
export function useRuta(): string[] {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function ir(a: string) {
  window.location.hash = a.startsWith('#') ? a : `#/${a}`;
}

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);

  return enLinea;
}
