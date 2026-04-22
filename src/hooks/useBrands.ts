import { useState, useEffect } from 'react';

let cachedBrands: string[] | null = null;

export function useBrands() {
  const [brands, setBrands] = useState<string[]>(cachedBrands || []);
  const [loading, setLoading] = useState(!cachedBrands);

  useEffect(() => {
    // Always revalidate: brands are derived from user_scorecards.title, so
    // creating/renaming a scorecard mid-session changes the list. Show the
    // cached value immediately to avoid flicker, then refresh in the background.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/brands', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            cachedBrands = data;
            setBrands(data);
          }
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { brands, loading };
}
