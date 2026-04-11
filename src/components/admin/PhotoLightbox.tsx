'use client';

import { useEffect, useCallback, useRef } from 'react';

interface PhotoLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    // Move focus into dialog
    const prev = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" aria-label={alt}>
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-xl transition-colors"
          aria-label="Close image lightbox"
        >
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={e => e.stopPropagation()}
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
