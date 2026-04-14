import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface AuthButtonsProps {
  user: any;
  loading?: boolean;
  onAccountClick: () => void;
  onLogout: () => void;
  variant?: 'light' | 'dark';
}

export function AuthButtons({ user, loading, onAccountClick, onLogout, variant = 'dark' }: AuthButtonsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Show nothing while auth is loading — prevents flash of "Login" button
  if (loading) {
    return <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />;
  }

  if (!user) {
    return (
      <button
        onClick={() => router.push('/auth/login')}
        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow text-sm w-full md:w-auto"
      >
        Login
      </button>
    );
  }

  const email: string = user.email || '';
  const rawName = user.user_metadata?.name || user.user_metadata?.display_name || user.username || email.split('@')[0] || 'User';
  const cleanName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const initial = (displayName[0] || 'U').toUpperCase();
  const dashboardHref = user.role === 'ADMIN' ? '/admin/dashboard' : user.role === 'BRAND' ? '/portal' : '/admin/dashboard';
  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'BRAND' ? 'Brand' : 'User';
  const isLight = variant === 'light';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all ${
          isLight
            ? 'hover:bg-white/15 border-white/20 hover:border-white/40'
            : 'hover:bg-slate-100 border-transparent hover:border-slate-200'
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold tracking-tight ${
          isLight ? 'bg-white/20 backdrop-blur-sm' : 'bg-slate-800'
        }`}>
          {initial}
        </div>
        <div className="hidden sm:flex flex-col items-start">
          <span className={`text-sm font-medium leading-tight max-w-[120px] truncate ${isLight ? 'text-white' : 'text-slate-700'}`}>
            {displayName}
          </span>
          <span className={`text-[10px] leading-tight ${isLight ? 'text-white/60' : 'text-slate-400'}`}>
            {roleLabel}
          </span>
        </div>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''} ${isLight ? 'text-white/50' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden py-1">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            {email && <p className="text-xs text-slate-400 truncate mt-0.5">{email}</p>}
          </div>
          <Link
            href={dashboardHref}
            prefetch={true}
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            {user.role === 'ADMIN' ? 'Dashboard' : 'Portal'}
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
