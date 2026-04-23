'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useBrands } from '@/hooks/useBrands';
import { extractExifFromFile } from '@/utils/extractExif';
import { compressImageForUpload } from '@/utils/compressImage';
import { reverseGeocode, type ReverseGeocodeResult } from '@/utils/reverseGeocode';
import { findNearbyStore } from '@/utils/findNearbyStore';
import { findStoreByAddress } from '@/utils/findStoreByAddress';
import { lookupStoreByName, type StoreLookup } from '@/utils/lookupStoreByName';
import AddressAutocomplete from './AddressAutocomplete';

interface MarketVisitUploadProps {
  onUploaded: () => void;
}

export default function MarketVisitUpload({ onUploaded }: MarketVisitUploadProps) {
  const { brands } = useBrands();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'exif' | 'geolocation' | 'manual' | null>(null);
  const [photoTakenAt, setPhotoTakenAt] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [address, setAddress] = useState('');
  const [storeName, setStoreName] = useState('');
  const [note, setNote] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [noGps, setNoGps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mobile-only inline suggestion under the Store Name input. Toasts on a
  // 390px viewport land top-right, far from the field and the user's thumb,
  // so on small screens we render an inline chip instead — easier to tap, sits
  // right where the validation applies.
  type StoreSuggestion =
    | { kind: 'suggest'; trimmed: string; suggestion: string; extra: string; store: StoreLookup }
    | { kind: 'unknown'; trimmed: string };
  const [pendingSuggestion, setPendingSuggestion] = useState<StoreSuggestion | null>(null);
  // Tracks the value we last fired the chain_stores lookup against so blur on
  // an already-validated name doesn't re-toast.
  const lastValidatedStoreNameRef = useRef<string>('');
  // Address values we auto-filled from chain_stores. Lets us safely overwrite
  // with a new chain_stores match while still respecting any address the
  // admin (or Nominatim) typed manually.
  const autoFilledAddressRef = useRef<string>('');
  // Mirror of `address` so callbacks closed over by toast actions read the
  // current value rather than the value at toast-creation time.
  const addressRef = useRef<string>('');
  addressRef.current = address;
  const storeNameRef = useRef<string>('');
  storeNameRef.current = storeName;

  const fillAddressIfEmpty = useCallback((next: string) => {
    if (!next) return;
    const current = addressRef.current.trim();
    if (current && current !== autoFilledAddressRef.current) return;
    setAddress(next);
    autoFilledAddressRef.current = next;
  }, []);

  const applyStoreMatch = useCallback((store: StoreLookup) => {
    if (store.store_name) setStoreName(store.store_name);
    if (store.address) fillAddressIfEmpty(store.address);
  }, [fillAddressIfEmpty]);

  // Picks the most authoritative source for store_name + address given a
  // GPS-reverse-geocoded result and (optionally) a nearby prior visit.
  // Priority:
  //   1. chain_stores match by address  — canonical brand data wins outright,
  //      and we trust the canonical street address even if Nominatim's
  //      geocoder snapped to a neighboring number.
  //   2. prior visit storeName + Nominatim address — admin's own data.
  //   3. Nominatim shop-tag + Nominatim address — generic fallback.
  const resolveStoreFromCoords = useCallback(async (
    geo: ReverseGeocodeResult | null,
    nearby: { storeName: string; distanceM: number } | null,
  ) => {
    let chainMatch: StoreLookup | null = null;
    if (geo?.details) {
      chainMatch = await findStoreByAddress(geo.details);
    }
    if (chainMatch) {
      if (chainMatch.store_name) {
        setStoreName(chainMatch.store_name);
        // Mark as already-validated so the blur handler doesn't re-toast
        // the canonical name we just set.
        lastValidatedStoreNameRef.current = chainMatch.store_name;
      }
      if (chainMatch.address) {
        setAddress(chainMatch.address);
        autoFilledAddressRef.current = chainMatch.address;
      }
      return;
    }
    if (geo?.address) setAddress(geo.address);
    const suggested = nearby?.storeName || geo?.storeName;
    if (suggested && !storeNameRef.current) setStoreName(suggested);
  }, []);

  const isMobileViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

  const validateStoreName = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      lastValidatedStoreNameRef.current = '';
      setPendingSuggestion(null);
      return;
    }
    if (trimmed === lastValidatedStoreNameRef.current) return;
    lastValidatedStoreNameRef.current = trimmed;
    setPendingSuggestion(null);

    const result = await lookupStoreByName(trimmed);
    if (!result) return;

    const { match, store } = result;
    if (match.kind === 'exact' && store) {
      if (store.address) fillAddressIfEmpty(store.address);
      return;
    }
    if (match.kind === 'normalized' && store) {
      applyStoreMatch(store);
      lastValidatedStoreNameRef.current = store.store_name || trimmed;
      // Confirmation only — non-actionable, so a top-right toast on phone is
      // still acceptable here.
      toast.success(
        `Store name auto-corrected: "${trimmed}" → "${store.store_name}"`,
        { description: 'Matched to Store Data.' },
      );
      return;
    }
    if ((match.kind === 'prefix' || match.kind === 'fuzzy') && store) {
      const suggestion = match.suggestion;
      const extra =
        match.kind === 'prefix' && match.alternatives.length > 0
          ? ` (+${match.alternatives.length} more)`
          : '';
      if (isMobileViewport()) {
        setPendingSuggestion({ kind: 'suggest', trimmed, suggestion, extra, store });
      } else {
        toast.warning(`"${trimmed}" not found in Store Data`, {
          description: `Did you mean "${suggestion}"?${extra}`,
          action: {
            label: `Use "${suggestion}"`,
            onClick: () => {
              applyStoreMatch(store);
              lastValidatedStoreNameRef.current = store.store_name || suggestion;
            },
          },
          duration: 6000,
        });
      }
      return;
    }
    if (match.kind === 'unknown') {
      if (isMobileViewport()) {
        setPendingSuggestion({ kind: 'unknown', trimmed });
      } else {
        toast.warning(`"${trimmed}" not found in Store Data`, {
          description:
            'Double-check the store exists in Store Management — this store name has no match.',
          duration: 6000,
        });
      }
    }
  }, [applyStoreMatch, fillAddressIfEmpty]);

  const acceptSuggestion = useCallback(() => {
    if (!pendingSuggestion || pendingSuggestion.kind !== 'suggest') return;
    const { store, suggestion } = pendingSuggestion;
    applyStoreMatch(store);
    lastValidatedStoreNameRef.current = store.store_name || suggestion;
    setPendingSuggestion(null);
  }, [pendingSuggestion, applyStoreMatch]);

  const resetForm = useCallback(() => {
    setFile(null);
    setPreview(null);
    setVisitDate(new Date().toISOString().split('T')[0]);
    setLatitude(null);
    setLongitude(null);
    setAccuracyM(null);
    setLocationSource(null);
    setPhotoTakenAt(null);
    setGeoLoading(false);
    setAddress('');
    setStoreName('');
    setNote('');
    setSelectedBrands([]);
    setNoGps(false);
    setError(null);
    lastValidatedStoreNameRef.current = '';
    autoFilledAddressRef.current = '';
    setPendingSuggestion(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      setError('Photo must be under 10MB');
      return;
    }
    // iOS Safari often reports HEIC as "" or "image/heif" — also accept by extension
    const mime = f.type.toLowerCase();
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    if (mime && !allowedMimes.includes(mime)) {
      setError('Only JPEG, PNG, WebP and HEIC images are allowed');
      return;
    }
    if (!mime && !allowedExts.includes(ext)) {
      setError('Only JPEG, PNG, WebP and HEIC images are allowed');
      return;
    }

    setError(null);

    // Read file bytes immediately — iOS Safari can garbage-collect the camera
    // file reference while the user fills in the form, causing
    // "The string did not match the expected pattern" on upload.
    let stableFile: File;
    try {
      const buffer = await f.arrayBuffer();
      stableFile = new File([buffer], f.name, { type: mime || 'image/jpeg', lastModified: f.lastModified });
    } catch {
      setError('Could not read the photo. Please re-select it.');
      return;
    }

    setFile(stableFile);
    setPreview(URL.createObjectURL(stableFile));
    setExtracting(true);
    setNoGps(false);

    try {
      const exif = await extractExifFromFile(stableFile);

      if (exif.dateTaken) {
        const d = new Date(exif.dateTaken);
        if (!isNaN(d.getTime())) {
          setPhotoTakenAt(d.toISOString());
          setVisitDate(d.toISOString().split('T')[0]);
        }
      }

      if (exif.latitude !== null && exif.longitude !== null) {
        setLatitude(exif.latitude);
        setLongitude(exif.longitude);
        setAccuracyM(null);
        setLocationSource('exif');
        const [geo, nearby] = await Promise.all([
          reverseGeocode(exif.latitude, exif.longitude),
          findNearbyStore(exif.latitude, exif.longitude),
        ]);
        await resolveStoreFromCoords(geo, nearby);
      } else {
        setNoGps(true);
      }
    } catch {
      setNoGps(true);
    } finally {
      setExtracting(false);
    }
  }, [resolveStoreFromCoords]);

  // iOS Safari requires a user gesture to prompt for location; this runs
  // from a button tap. Timeout protects against the documented iOS quirk
  // where getCurrentPosition can hang indefinitely.
  const useCurrentLocation = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setError('Location is not supported on this device.');
      return;
    }
    // iOS Safari silently rejects geolocation on non-HTTPS origins (incl. IP
    // addresses). Surface this rather than appearing to hang.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('Location requires HTTPS. Open the site via its https:// URL and try again.');
      return;
    }
    setGeoLoading(true);
    setError(null);

    const getPos = (highAccuracy: boolean) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 10000 : 15000,
          maximumAge: 60000,
        });
      });

    try {
      let pos: GeolocationPosition;
      try {
        pos = await getPos(true);
      } catch (err: any) {
        // iOS Safari Private Browsing often returns POSITION_UNAVAILABLE (2)
        // or times out (3) with high-accuracy GPS. Fall back to coarse
        // (wifi/cell) location before giving up.
        if (err?.code === 2 || err?.code === 3) {
          pos = await getPos(false);
        } else {
          throw err;
        }
      }
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setLatitude(lat);
      setLongitude(lng);
      setAccuracyM(typeof accuracy === 'number' ? accuracy : null);
      setLocationSource('geolocation');
      setNoGps(false);
      const [geo, nearby] = await Promise.all([
        reverseGeocode(lat, lng),
        findNearbyStore(lat, lng),
      ]);
      await resolveStoreFromCoords(geo, nearby);
    } catch (err: any) {
      const code = err?.code;
      if (code === 1) {
        setError('Location permission denied. On iPhone: Settings → Privacy & Security → Location Services → Safari → While Using.');
      } else if (code === 2) {
        setError('Location unavailable. Make sure Location Services are on (Settings → Privacy & Security → Location Services).');
      } else if (code === 3) {
        setError('Location timed out. Try again outside or enter the address manually.');
      } else {
        setError('Could not get your current location. Enter the address manually.');
      }
    } finally {
      setGeoLoading(false);
    }
  }, [resolveStoreFromCoords]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (selectedBrands.length === 0) {
      setError('Select at least one brand');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // Downscale before upload so we stay under Vercel's ~4.5MB serverless
      // payload limit. Mac Chrome saved images and Retina screenshots
      // regularly exceed that and previously failed with a bare "Upload
      // failed" (413 HTML → JSON parse failed on the client).
      const uploadFile = await compressImageForUpload(file);

      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('visit_date', visitDate);
      fd.append('brands', JSON.stringify(selectedBrands));
      if (latitude !== null) fd.append('latitude', String(latitude));
      if (longitude !== null) fd.append('longitude', String(longitude));
      if (accuracyM !== null) fd.append('accuracy_m', String(accuracyM));
      if (locationSource) fd.append('location_source', locationSource);
      if (photoTakenAt) fd.append('photo_taken_at', photoTakenAt);
      if (address) fd.append('address', address);
      if (storeName) fd.append('store_name', storeName);
      if (note) fd.append('note', note);

      const res = await fetch('/api/market-visits', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        let msg = 'Upload failed';
        let jsonOk = false;
        try {
          const data = await res.json();
          if (data?.error) { msg = data.error; jsonOk = true; }
        } catch { /* non-JSON response */ }
        // 413 / Vercel gateway errors return HTML, not JSON. Give the user
        // a hint about the cause rather than a bare "Upload failed".
        if (!jsonOk) {
          if (res.status === 413) msg = 'Photo is too large to upload. Try a smaller image.';
          else if (res.status >= 500) msg = 'Server error — please try again.';
        }
        throw new Error(msg);
      }

      resetForm();
      onUploaded();
    } catch (err: any) {
      // iOS browsers throw when the temp file blob is garbage-collected:
      //   Safari/WebKit: "The string did not match the expected pattern"
      //   Chrome on iOS:  "Failed to fetch" / "network error" / "NotReadableError"
      //   Any browser:    "NotFoundError" / "AbortError" when blob is gone
      const msg = (err.message || '').toLowerCase();
      const name = (err.name || '').toLowerCase();
      const isBlobGone = msg.includes('did not match') || msg.includes('expected pattern')
        || msg.includes('not readable') || msg.includes('notfounderror')
        || name === 'notreadableerror' || name === 'notfounderror' || name === 'aborterror'
        || (msg.includes('failed to fetch') && /ipad|iphone|ipod/i.test(navigator.userAgent));
      if (isBlobGone) {
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setError('Photo expired — please re-select your photo and try again.');
        setSubmitting(false);
        return;
      }
      setError(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <h3 className="text-lg font-bold text-gray-900">New Market Visit</h3>

      {/* Photo drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors flex items-center justify-center overflow-hidden ${
          dragOver ? 'border-amber-400 bg-amber-50' : preview ? 'border-gray-200' : 'border-gray-300 bg-gray-50 hover:border-amber-400 hover:bg-amber-50/50'
        }`}
        style={{ minHeight: preview ? 'auto' : '180px' }}
      >
        {preview ? (
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full max-h-[300px] object-contain" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); resetForm(); }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80 text-sm"
            >
              ✕
            </button>
            {extracting && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
                  <span className="text-sm">Reading photo data...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 px-4">
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">Drop a photo here or tap to browse</p>
            <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, HEIC — max 10MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {/* No GPS warning + device-location fallback */}
      {noGps && file && (
        <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>No location data found in this photo. Use your device&apos;s location, or enter the store address manually below.</span>
          </div>
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={geoLoading}
            className="self-start inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50"
          >
            {geoLoading ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                Getting location...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                Use my current location
              </>
            )}
          </button>
        </div>
      )}

      {/* Location info (shown when coords are known) */}
      {latitude !== null && longitude !== null && (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          <span>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
            {locationSource === 'exif' && ' · from photo'}
            {locationSource === 'geolocation' && ` · from device${accuracyM ? ` (±${Math.round(accuracyM)}m)` : ''}`}
            {locationSource === 'manual' && ' · from address'}
          </span>
        </div>
      )}

      {/* Fields grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Visit Date *</label>
          <input
            type="date"
            value={visitDate}
            onChange={e => setVisitDate(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
          <input
            type="text"
            value={storeName}
            onChange={e => {
              setStoreName(e.target.value);
              if (pendingSuggestion) setPendingSuggestion(null);
            }}
            onBlur={e => { void validateStoreName(e.target.value); }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void validateStoreName((e.target as HTMLInputElement).value);
              }
            }}
            placeholder="e.g. Cub Foods — Eagan"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
          />
          {pendingSuggestion && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800"
            >
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <div className="flex-1 min-w-0">
                {pendingSuggestion.kind === 'suggest' ? (
                  <>
                    <p className="leading-snug">
                      <span className="font-semibold">&ldquo;{pendingSuggestion.trimmed}&rdquo;</span> not found in Store Data.
                    </p>
                    <p className="mt-0.5 leading-snug">
                      Did you mean <span className="font-semibold">&ldquo;{pendingSuggestion.suggestion}&rdquo;</span>?{pendingSuggestion.extra}
                    </p>
                    <button
                      type="button"
                      onClick={acceptSuggestion}
                      className="mt-2 inline-flex items-center px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-md hover:bg-amber-600 active:scale-95 transition-transform"
                    >
                      Use &ldquo;{pendingSuggestion.suggestion}&rdquo;
                    </button>
                  </>
                ) : (
                  <p className="leading-snug">
                    <span className="font-semibold">&ldquo;{pendingSuggestion.trimmed}&rdquo;</span> not found in Store Data — double-check it exists in Store Management.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingSuggestion(null)}
                aria-label="Dismiss suggestion"
                className="text-amber-500 hover:text-amber-700 shrink-0 -mt-0.5 -mr-1 p-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          onSelect={(addr, lat, lng) => {
            setAddress(addr);
            setLatitude(lat);
            setLongitude(lng);
            setAccuracyM(null);
            setLocationSource('manual');
          }}
          placeholder={noGps ? 'Enter the store address' : 'Auto-filled from photo GPS'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
        />
      </div>

      {/* Brand multi-select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Brands in Photo *</label>
        <div className="flex flex-wrap gap-2">
          {brands.map(brand => (
            <button
              key={brand}
              type="button"
              onClick={() => toggleBrand(brand)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                selectedBrands.includes(brand)
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400 hover:text-amber-700'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Shelf position, stock level, promo display..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!file || submitting || extracting}
        className="w-full py-3 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            Uploading...
          </span>
        ) : 'Upload Visit'}
      </button>
    </form>
  );
}
