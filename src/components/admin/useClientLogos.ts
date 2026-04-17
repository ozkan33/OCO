'use client';
import { useEffect, useState } from 'react';
import { findRetailerFavicon } from '@/lib/retailerLogos';
import { findBrandLogo } from '@/lib/brandLogos';

export interface ClientLogo {
  id: string;
  label: string;
  image_url: string;
}

// Module-level cache so the three drawers don't each refetch on every open.
let cache: ClientLogo[] | null = null;
let inflight: Promise<ClientLogo[]> | null = null;
const subscribers = new Set<(logos: ClientLogo[]) => void>();

async function loadLogos(): Promise<ClientLogo[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/client-logos', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : []))
    .then((data: any[]) => {
      cache = Array.isArray(data)
        ? data.map(d => ({ id: d.id, label: d.label, image_url: d.image_url }))
        : [];
      subscribers.forEach(cb => cb(cache!));
      return cache;
    })
    .catch(() => {
      cache = [];
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const normalize = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/\s*&\s*/g, '&')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function findLogo(logos: ClientLogo[], name: string | null | undefined): string | null {
  if (!name) return null;
  const target = normalize(name);
  if (!target) return null;
  // 1. Exact match against the uploaded client_logos (brand logos live here).
  const exact = logos.find(l => normalize(l.label) === target);
  if (exact) return exact.image_url;
  // 2. Substring match against client_logos (both directions).
  const partial = logos.find(l => {
    const n = normalize(l.label);
    return n && (n.includes(target) || target.includes(n));
  });
  if (partial) return partial.image_url;
  // 3. Bundled retailer favicon catalogue (Hy-Vee, Lunds & Byerlys, …) —
  //    /public/favicons/*.png mapped by retailer name in @/lib/retailerLogos.
  const retailer = findRetailerFavicon(name);
  if (retailer) return retailer;
  // 4. Bundled brand favicon catalogue (Cry Baby Craig's, JoMomma's, …) —
  //    /public/logos/*.png mapped by brand name in @/lib/brandLogos.
  return findBrandLogo(name);
}

export function useClientLogos(): ClientLogo[] {
  const [logos, setLogos] = useState<ClientLogo[]>(() => cache || []);
  useEffect(() => {
    let mounted = true;
    if (cache) setLogos(cache);
    const sub = (next: ClientLogo[]) => { if (mounted) setLogos(next); };
    subscribers.add(sub);
    loadLogos().then(next => { if (mounted) setLogos(next); });
    return () => { mounted = false; subscribers.delete(sub); };
  }, []);
  return logos;
}
