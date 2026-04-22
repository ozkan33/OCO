'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
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

  // Off-homepage, the hash-only nav links don't resolve to any section on the current page.
  // Rewrite them to point back at the homepage sections so clicks actually navigate.
  const resolveNavHref = (hash: string) => (isHomepage ? hash : `/${hash}`);

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
              href={resolveNavHref(l.href)}
              className={`inline-flex items-center min-h-[44px] px-2 text-sm font-medium transition-colors duration-300 ${
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
            className={`inline-flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-300 ${
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
          {user && (() => {
            const dashboardHref = user.role === 'BRAND' ? '/portal' : '/admin/dashboard';
            const dashboardLabel = user.role === 'BRAND' ? 'Portal' : 'Dashboard';
            return (
              <Link
                href={dashboardHref}
                prefetch={true}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 text-[#0f172a] hover:text-slate-700 font-semibold text-sm min-h-[44px] py-2.5 border-b border-slate-50"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                {dashboardLabel}
              </Link>
            );
          })()}
          {navLinks.map(l => (
            <a
              key={l.href}
              href={resolveNavHref(l.href)}
              onClick={() => setMenuOpen(false)}
              className="flex items-center text-slate-700 hover:text-[#0f172a] font-medium text-sm min-h-[44px] py-2.5 border-b border-slate-50 last:border-0"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-3">
            {!user ? (
              <button
                onClick={handleLoginClick}
                className="inline-flex items-center justify-center w-full min-h-[48px] py-2.5 bg-[#0f172a] text-white text-sm font-semibold rounded-lg hover:bg-[#1e293b] transition"
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
