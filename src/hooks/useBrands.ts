import { useState, useEffect } from 'react';

let cachedBrands: string[] | null = null;

export function useBrands() {
  const [brands, setBrands] = useState<string[]>(cachedBrands || []);
  const [loading, setLoading] = useState(!cachedBrands);

  useEffect(() => {
    if (cachedBrands) return;
    (async () => {
      try {
        const res = await fetch('/api/brands', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          cachedBrands = data;
          setBrands(data);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  return { brands, loading };
}
