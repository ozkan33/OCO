'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { AuthButtons } from '../auth/AuthButtons';
import { getMobileBrowserInfo } from '@/utils/mobileDetection';

interface HeaderProps {
  user: any;
  loading?: boolean;
  onAccountClick: () => void;
  onLogout: () => void;
}

const navLinks = [
  { href: '#retailers', label: 'Retailers' },
  { href: '#clients', label: 'Clients' },
  { href: '#contact', label: 'Contact' },
];

export function Header({ user, loading, onAccountClick, onLogout }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Only use light/transparent variant on the homepage (which has a dark hero)
  const isHomepage = pathname === '/';
  const useLight = isHomepage && !scrolled;

  useEffect(() => {
    const info = getMobileBrowserInfo();
    if (info?.isSafari) setIsSafari(true);
  }, []);

  // Show solid background after scrolling past hero
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler, { passive: true });
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', handler, { passive: true });
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const handleLoginClick = () => {
    setMenuOpen(false);
    isSafari ? (window.location.href = '/auth/login') : router.push('/auth/login');
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        useLight
          ? 'bg-transparent'
          : 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-200/60'
      }`}
    >
      <nav className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo variant={useLight ? 'light' : 'dark'} />

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors duration-300 ${
                useLight
                  ? 'text-white/80 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {l.label}
            </a>
          ))}
          <AuthButtons user={user} loading={loading} onAccountClick={onAccountClick} onLogout={onLogout} variant={useLight ? 'light' : 'dark'} />
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <AuthButtons user={user} loading={loading} onAccountClick={onAccountClick} onLogout={onLogout} variant={useLight ? 'light' : 'dark'} />
          <button
            ref={btnRef}
            onClick={() => setMenuOpen(o => !o)}
            className={`p-2 rounded-lg transition-colors duration-300 ${
              useLight
                ? 'text-white hover:bg-white/10'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu — slides down */}
      <div
        ref={menuRef}
        className={`md:hidden overflow-hidden transition-all duration-200 bg-white border-t border-slate-100 ${
          menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 py-4 flex flex-col gap-1">
          {navLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-slate-700 hover:text-[#0f172a] font-medium text-sm py-2.5 border-b border-slate-50 last:border-0"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-3">
            {!user ? (
              <button
                onClick={handleLoginClick}
                className="w-full py-2.5 bg-[#0f172a] text-white text-sm font-semibold rounded-lg hover:bg-[#1e293b] transition"
              >
                Partner Portal Login
              </button>
            ) : (
              <AuthButtons
                user={user}
                onAccountClick={() => { setMenuOpen(false); onAccountClick(); }}
                onLogout={() => { setMenuOpen(false); onLogout(); }}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
