'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from './Logo';
import { AuthButtons } from '../auth/AuthButtons';
import { getMobileBrowserInfo } from '@/utils/mobileDetection';

interface HeaderProps {
  user: any;
  onAccountClick: () => void;
  onLogout: () => void;
}

const navLinks = [
  { href: '#about',   label: 'About' },
  { href: '#clients', label: 'Clients' },
  { href: '#contact', label: 'Contact' },
];

export function Header({ user, onAccountClick, onLogout }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition ${
                scrolled ? 'text-gray-600 hover:text-[#0f172a]' : 'text-white/80 hover:text-white'
              }`}
            >
              {l.label}
            </a>
          ))}
          <AuthButtons user={user} onAccountClick={onAccountClick} onLogout={onLogout} variant={scrolled ? 'dark' : 'light'} />
        </div>

        {/* Mobile hamburger */}
        <button
          ref={btnRef}
          onClick={() => setMenuOpen(o => !o)}
          className={`md:hidden p-2 rounded-lg transition ${
            scrolled ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'
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
      </nav>

      {/* Mobile menu — slides down */}
      <div
        ref={menuRef}
        className={`md:hidden overflow-hidden transition-all duration-200 bg-white border-t border-gray-100 ${
          menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 py-4 flex flex-col gap-1">
          {navLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-gray-700 hover:text-[#0f172a] font-medium text-sm py-2.5 border-b border-gray-50 last:border-0"
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
