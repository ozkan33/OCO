'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { handleMobileRedirect, getMobileBrowserInfo } from '@/utils/mobileDetection';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const router = useRouter();

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [pendingRedirect, setPendingRedirect] = useState('/admin/dashboard');

  // Detect Safari on mount
  useEffect(() => {
    const mobileInfo = getMobileBrowserInfo();
    if (mobileInfo?.isSafari) setIsSafari(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // Safari-safe environment variable access
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration is missing. Please check your environment variables.');
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);

      if (error || !data?.session) {
        // Generic message — never reveal whether the email exists or the exact failure reason
        setError('Invalid email or password.');
        return;
      }

      // Send only the tokens to the server — not the user object
      const response = await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      });

      if (!response.ok) {
        setError('Authentication failed. Please try again.');
        return;
      }

      // Determine redirect based on role
      const role = data.user?.user_metadata?.role;
      const mustChangePassword = data.user?.user_metadata?.must_change_password;
      const totpEnabled = data.user?.user_metadata?.totp_enabled;
      let redirectTo = '/admin/dashboard';

      if (role === 'BRAND') {
        redirectTo = mustChangePassword ? '/auth/change-password' : '/portal';
      }

      // Check if 2FA is required and device is not trusted
      if (totpEnabled && !mustChangePassword) {
        // Check trusted device cookie (server already set it, we check via API)
        const tfaRes = await fetch('/api/auth/2fa/setup', { credentials: 'include' });
        const tfaData = tfaRes.ok ? await tfaRes.json() : null;

        if (tfaData?.enabled) {
          // Check if this device has the trusted_device cookie
          // If the cookie exists and is valid, the server will handle it
          // For now, show the 2FA input
          setPendingRedirect(redirectTo);
          setNeeds2FA(true);
          return;
        }
      }

      // Log the session
      await fetch('/api/auth/log-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ action: 'login' }),
      }).catch(() => {});

      // Navigate
      if (isSafari) {
        window.location.href = redirectTo;
      } else {
        try { await router.push(redirectTo); }
        catch { window.location.href = redirectTo; }
      }
      
    } catch {
      setLoading(false);
      setError('An unexpected error occurred. Please try again.');
    }
  };

  const handleVerify2FA = async () => {
    setError(null);
    if (totpCode.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: totpCode, trustDevice }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Invalid code.'); setLoading(false); return; }
      // Log session
      await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'login' }) }).catch(() => {});
      window.location.href = pendingRedirect;
    } catch { setError('Verification failed.'); setLoading(false); }
  };

  const handleBackClick = () => {
    if (isSafari) {
      window.location.href = '/';
    } else {
      try {
        router.push('/');
      } catch (routerError) {
        console.error('Router error, falling back to window.location:', routerError);
        window.location.href = '/';
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#e0e7ef] to-[#e0e7ef] py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <Image
          src="https://i.hizliresim.com/rm69m47.png"
          alt="3 Brothers Marketing Logo"
          width={64}
          height={64}
          className="h-16 w-auto mb-4 cursor-pointer transition-transform hover:scale-105"
          onClick={handleBackClick}
        />
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{needs2FA ? 'Two-Factor Authentication' : 'Sign In'}</h2>
        <p className="text-gray-500 mb-6 text-center">{needs2FA ? 'Enter the code from your authenticator app.' : 'Welcome back! Please enter your credentials to access your dashboard.'}</p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center mb-4 w-full" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* 2FA Verification */}
        {needs2FA ? (
          <div className="w-full space-y-5">
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000" autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <label className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 cursor-pointer">
              <input type="checkbox" checked={trustDevice} onChange={e => setTrustDevice(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">Trust this device for 30 days</p>
                <p className="text-xs text-gray-400">Skip 2FA on this device next time.</p>
              </div>
            </label>
            <button type="button" onClick={handleVerify2FA} disabled={loading || totpCode.length !== 6}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setNeeds2FA(false); setTotpCode(''); setError(null); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
              Back to login
            </button>
          </div>
        ) : (
        <form className="w-full space-y-5" onSubmit={handleLogin}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </span>
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>
          
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-lg shadow disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        )}

        <button
          className="text-gray-600 hover:underline mt-4"
          onClick={handleBackClick}
        >
          Back
        </button>
      </div>
    </div>
  );
} 