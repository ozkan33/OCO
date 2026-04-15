'use client';

import { useState, useRef, useCallback } from 'react';
import { useBrands } from '@/hooks/useBrands';
import { extractExifFromFile } from '@/utils/extractExif';
import { reverseGeocode } from '@/utils/reverseGeocode';
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
  const [address, setAddress] = useState('');
  const [storeName, setStoreName] = useState('');
  const [note, setNote] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [noGps, setNoGps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFile(null);
    setPreview(null);
    setVisitDate(new Date().toISOString().split('T')[0]);
    setLatitude(null);
    setLongitude(null);
    setAddress('');
    setStoreName('');
    setNote('');
    setSelectedBrands([]);
    setNoGps(false);
    setError(null);
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
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setExtracting(true);
    setNoGps(false);

    try {
      const exif = await extractExifFromFile(f);

      if (exif.dateTaken) {
        const d = new Date(exif.dateTaken);
        if (!isNaN(d.getTime())) {
          setVisitDate(d.toISOString().split('T')[0]);
        }
      }

      if (exif.latitude !== null && exif.longitude !== null) {
        setLatitude(exif.latitude);
        setLongitude(exif.longitude);
        const geo = await reverseGeocode(exif.latitude, exif.longitude);
        if (geo?.address) setAddress(geo.address);
        if (geo?.storeName && !storeName) setStoreName(geo.storeName);
      } else {
        setNoGps(true);
      }
    } catch {
      setNoGps(true);
    } finally {
      setExtracting(false);
    }
  }, []);

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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('visit_date', visitDate);
      fd.append('brands', JSON.stringify(selectedBrands));
      if (latitude !== null) fd.append('latitude', String(latitude));
      if (longitude !== null) fd.append('longitude', String(longitude));
      if (address) fd.append('address', address);
      if (storeName) fd.append('store_name', storeName);
      if (note) fd.append('note', note);

      const res = await fetch('/api/market-visits', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      resetForm();
      onUploaded();
    } catch (err: any) {
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

      {/* No GPS warning */}
      {noGps && file && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>No location data found in this photo. You can enter the store address manually below.</span>
        </div>
      )}

      {/* Location info (shown when GPS detected) */}
      {latitude !== null && longitude !== null && (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
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
            onChange={e => setStoreName(e.target.value)}
            placeholder="e.g. Cub Foods — Eagan"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
          />
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
