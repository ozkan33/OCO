'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/components/layout/Logo';
import { FiLogOut } from 'react-icons/fi';
import { Role, ROLE_LABELS } from '../../../lib/rbac';

// Nav items visible per role. Internal roles (KAM, FSR) are scoped to the
// pages they can actually reach — middleware enforces the same restriction,
// but hiding the links avoids dead UI.
const NAV_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  ADMIN: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/market-visits', label: 'Market Visits' },
    { href: '/admin/stores', label: 'Stores' },
    { href: '/admin/clients', label: 'Clients' },
    { href: '/admin/client-logos', label: 'Logos' },
    { href: '/admin/visitors', label: 'Visitors' },
    { href: '/admin/activity', label: 'Activity' },
  ],
  KEY_ACCOUNT_MANAGER: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/market-visits', label: 'Market Visits' },
  ],
  FIELD_SALES_REP: [
    { href: '/admin/market-visits', label: 'Market Visits' },
  ],
};

interface AdminHeaderProps {
  rightContent?: React.ReactNode;
}

export default function AdminHeader({ rightContent }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  const handleLogout = async () => {
    await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/auth/login';
  };

  const rawName = user?.user_metadata?.name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Admin';
  // If the name looks like an email, extract just the part before @
  const cleanName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const initial = displayName.charAt(0).toUpperCase();

  // Resolve the user's role → nav items + friendly label under their name.
  const rawRole = (user?.user_metadata?.role || user?.role || 'ADMIN') as string;
  const role = (rawRole || '').toUpperCase();
  const navItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.ADMIN;
  const roleLabel = ROLE_LABELS[role as Role] ?? 'Admin';

  return (
    <header
      className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <nav className="w-full px-3 sm:px-6 py-2.5 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <Link href="/" aria-label="3Brothers Marketing home" className="flex items-center gap-2.5 group shrink-0 min-h-[44px] min-w-[44px] justify-center sm:justify-start">
            <LogoMark size={32} />
            <span className="text-base font-bold text-slate-800 group-hover:text-slate-600 transition-colors hidden sm:inline">
              3Brothers Marketing
            </span>
          </Link>
          <div className="hidden sm:block w-px h-5 bg-slate-200" />
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5 overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map(item => {
                const isActive = pathname === item.href;
                // Dashboard grid doesn't fit phone viewports — hide the link
                // under sm so phone users can't navigate into the unusable page.
                const phoneHidden = item.href === '/admin/dashboard';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={`inline-flex items-center px-3 sm:px-3.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                      phoneHidden ? 'hidden sm:inline-flex ' : ''
                    }${
                      isActive
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                    }`}
                    {...(isActive ? { 'aria-current': 'page' as const } : {})}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="sm:hidden pointer-events-none absolute top-0 right-0 h-full w-5 bg-gradient-to-l from-white/90 to-transparent" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {rightContent}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2.5 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white text-xs font-semibold tracking-tight">
                {initial}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium text-slate-700 leading-tight max-w-[120px] truncate">{displayName}</span>
                <span className="text-[10px] text-slate-400 leading-tight">{roleLabel}</span>
              </div>
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                  {user?.email && <p className="text-xs text-slate-400 truncate">{user.email}</p>}
                </div>
                <div className="py-1">
                  <Link
                    href="/admin/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
                  >
                    <FiLogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
