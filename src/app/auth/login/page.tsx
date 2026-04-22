'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { handleMobileRedirect, getMobileBrowserInfo } from '@/utils/mobileDetection';
import { Role, getLandingPath, isRole } from '../../../../lib/rbac';
import {
  isBiometricSupported,
  hasPasskeyFor,
  signInWithPasskey,
} from '@/lib/webauthn/client';
import PasskeyEnrollModal, { shouldSkipPasskeyPrompt } from '@/components/auth/PasskeyEnrollModal';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [pendingRedirect, setPendingRedirect] = useState('/admin/dashboard');

  // Recovery flow when the stored TOTP secret can't be decrypted on this server
  // (key rotation / corruption). See /api/auth/2fa/reset.
  const [totpUnreadable, setTotpUnreadable] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  // Biometric (WebAuthn / Face ID / Touch ID / Windows Hello) login.
  // Shown only when (a) the platform has a built-in authenticator AND
  // (b) the typed email actually has a passkey on this server — otherwise
  // offering it would fail in a user-hostile way.
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricHas, setBiometricHas] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  // Synchronous guard for the biometric handler. `biometricBusy` is React
  // state and won't flush before a rapid second click can re-enter
  // handleBiometricLogin. A ref blocks the re-entry atomically so the
  // second request can't overwrite the challenge cookie before the first
  // authenticator prompt finishes.
  const biometricBusyRef = useRef(false);

  // Post-login passkey enrollment prompt. When non-null, the modal is
  // rendered and final navigation is deferred until the user enrolls,
  // skips, or chooses "don't ask again" — onClose kicks off the redirect.
  const [passkeyPromptRedirect, setPasskeyPromptRedirect] = useState<string | null>(null);

  // Decide whether to show the post-login passkey prompt. Returns true if
  // the caller should stop and wait for the modal to resolve; false means
  // proceed with the redirect immediately.
  const maybeShowPasskeyPrompt = async (emailForPrompt: string, redirectTo: string): Promise<boolean> => {
    if (!emailForPrompt) return false;
    if (!biometricReady) return false;
    // Don't interrupt onboarding (password/2FA enrollment flows) with a
    // passkey upsell — the user hasn't finished setting up the account yet.
    if (redirectTo.startsWith('/auth/')) return false;
    if (shouldSkipPasskeyPrompt(emailForPrompt)) return false;
    try {
      if (await hasPasskeyFor(emailForPrompt)) return false;
    } catch {
      return false;
    }
    setPasskeyPromptRedirect(redirectTo);
    return true;
  };

  // Detect Safari on mount
  useEffect(() => {
    const mobileInfo = getMobileBrowserInfo();
    if (mobileInfo?.isSafari) setIsSafari(true);
    isBiometricSupported().then(setBiometricReady);
  }, []);

  // Debounce: check for a passkey 450ms after the user stops typing their
  // email. The `has-credentials` endpoint rate-limits and time-pads so it
  // can't be used for enumeration — we can call it freely from here.
  useEffect(() => {
    if (!biometricReady) { setBiometricHas(false); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setBiometricHas(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const has = await hasPasskeyFor(email);
      if (!cancelled) setBiometricHas(has);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [email, biometricReady]);

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

      if (error || !data?.session) {
        // Generic message — never reveal whether the email exists or the exact failure reason
        setError('Invalid email or password.');
        setLoading(false);
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
        setLoading(false);
        return;
      }

      // Determine redirect based on role
      const rawRole = data.user?.user_metadata?.role;
      const role = isRole(typeof rawRole === 'string' ? rawRole.toUpperCase() : null) ? (rawRole.toUpperCase() as Role) : null;
      const mustChangePassword = data.user?.user_metadata?.must_change_password;
      const mustEnroll2FA = data.user?.user_metadata?.must_enroll_2fa;
      const totpEnabled = data.user?.user_metadata?.totp_enabled;
      let redirectTo = getLandingPath(role);

      // /auth/change-password owns both onboarding steps (password + 2FA enroll)
      // for any non-admin portal user. If either flag is set, route there —
      // middleware enforces the same gate defensively, but routing client-side
      // avoids a flash of /portal.
      if (role && role !== Role.ADMIN && (mustChangePassword || mustEnroll2FA)) {
        redirectTo = '/auth/change-password';
      }

      // Check if 2FA is required and device is not trusted.
      // Skip the prompt when the user is on an onboarding flow — enrollment (not
      // verification) is what they need, and change-password owns that UI.
      if (totpEnabled && !mustChangePassword && !mustEnroll2FA) {
        // First check if this device is already trusted (has valid cookie + DB record)
        const trustedRes = await fetch('/api/auth/2fa/check-trusted', { credentials: 'include' });
        const trustedData = trustedRes.ok ? await trustedRes.json() : null;

        if (trustedData?.trusted) {
          // Device is trusted — skip 2FA, log session and navigate
          await fetch('/api/auth/log-session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ action: 'login', device_trusted: true }),
          }).catch(() => {});
          // PWA Phase 2: flag the first authenticated page load so the admin
          // install banner can one-shot render. Cleared by the banner on read.
          try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
          if (await maybeShowPasskeyPrompt(email, redirectTo)) { setLoading(false); return; }
          if (isSafari) { window.location.href = redirectTo; }
          else { try { await router.push(redirectTo); } catch { window.location.href = redirectTo; } }
          return;
        }

        // Device not trusted — check if 2FA is actually enabled and show the prompt
        const tfaRes = await fetch('/api/auth/2fa/setup', { credentials: 'include' });
        const tfaData = tfaRes.ok ? await tfaRes.json() : null;

        if (tfaData?.enabled) {
          setPendingRedirect(redirectTo);
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
      }

      // Log the session
      await fetch('/api/auth/log-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ action: 'login' }),
      }).catch(() => {});

      // PWA Phase 2: flag the first authenticated page load so the admin
      // install banner can one-shot render.
      try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}

      if (await maybeShowPasskeyPrompt(email, redirectTo)) { setLoading(false); return; }

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
      if (!res.ok) {
        const d = await res.json();
        // Specific recovery path: stored secret can't be decrypted on this server.
        // Offer the password-gated reset flow instead of leaving the user stuck.
        if (d.code === 'TOTP_UNREADABLE') {
          setTotpUnreadable(true);
          setError(null);
          setLoading(false);
          return;
        }
        setError(d.error || 'Invalid code.');
        setLoading(false);
        return;
      }
      await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'login' }) }).catch(() => {});
      // PWA Phase 2: flag the first authenticated page load so the admin
      // install banner can one-shot render.
      try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
      if (await maybeShowPasskeyPrompt(email, pendingRedirect)) { setLoading(false); return; }
      window.location.href = pendingRedirect;
    } catch { setError('Verification failed.'); setLoading(false); }
  };

  const handleReset2FA = async () => {
    setError(null);
    if (!resetPassword) { setError('Enter your password to confirm.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ password: resetPassword }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not reset 2FA.');
        setLoading(false);
        return;
      }
      // 2FA is now cleared server-side. Send the user through normally — no second factor,
      // and they can re-enrol from admin settings once signed in.
      await fetch('/api/auth/log-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'login', twofa_reset: true }) }).catch(() => {});
      // PWA Phase 2: flag the first authenticated page load so the admin
      // install banner can one-shot render.
      try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
      if (await maybeShowPasskeyPrompt(email, pendingRedirect)) { setLoading(false); return; }
      window.location.href = pendingRedirect;
    } catch { setError('Reset failed. Please try again.'); setLoading(false); }
  };

  const handleBiometricLogin = async () => {
    if (biometricBusyRef.current) return;
    if (!email) { setError('Enter your email first.'); return; }
    biometricBusyRef.current = true;
    setError(null);
    setBiometricBusy(true);
    try {
      const { redirect } = await signInWithPasskey(email);
      try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
      // WebAuthn issues a fresh session AND sets 2fa_verified server-side, so
      // we just navigate. No separate log-session call here — the server has
      // all the context it needs from the verify route.
      window.location.href = redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face ID sign-in failed.');
      setBiometricBusy(false);
      biometricBusyRef.current = false;
    }
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
    <div
      className="min-h-screen min-h-[100dvh] flex items-center justify-center relative overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {passkeyPromptRedirect && (
        <PasskeyEnrollModal
          email={email}
          onClose={() => {
            const dest = passkeyPromptRedirect;
            setPasskeyPromptRedirect(null);
            window.location.href = dest;
          }}
        />
      )}
      {/* Background — reuses the hero image from the landing page for brand continuity */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center hero-ken-burns"
        style={{ backgroundImage: "url('/hero.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.65) 50%, rgba(15,23,42,0.82) 100%)',
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 sm:mx-auto">
        <div
          className="bg-white/[0.97] backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/20 border border-white/60 px-8 py-10 sm:px-10 sm:py-12 flex flex-col items-center"
          style={{ animation: 'fadeInUp 0.5s ease-out both' }}
        >
          {/* Logo + Brand */}
          <button
            onClick={handleBackClick}
            className="flex items-center gap-2.5 mb-8 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-2 py-1 -mx-2 -mt-1 transition-all"
            aria-label="Go back to homepage"
          >
            <Image
              src="/logo.png"
              alt="3Brothers Marketing"
              width={40}
              height={40}
              className="rounded-lg flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col items-start">
              <span className="text-lg font-bold text-slate-800 leading-tight">3Brothers</span>
              <span className="text-xs text-slate-400 leading-tight">Marketing</span>
            </div>
          </button>

          {/* Heading */}
          <h1
            className="text-2xl sm:text-3xl text-slate-900 mb-1.5 text-center"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {totpUnreadable ? 'Reset 2FA' : needs2FA ? 'Verification' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-slate-500 mb-7 text-center max-w-[280px]">
            {totpUnreadable
              ? 'Your authenticator enrollment could not be read. Confirm your password to reset 2FA — you can re-enroll from settings after signing in.'
              : needs2FA
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Sign in to access your dashboard.'}
          </p>

          {/* Error message */}
          {error && (
            <div
              className="w-full mb-5 flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 transition-all"
              role="alert"
              style={{ animation: 'fadeInUp 0.25s ease-out both' }}
            >
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* 2FA unreadable — self-service reset flow */}
          {totpUnreadable ? (
            <div className="w-full space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 placeholder-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                />
              </div>

              <button
                type="button"
                onClick={handleReset2FA}
                disabled={loading || !resetPassword}
                className="w-full py-4 min-h-[48px] bg-blue-500 text-white font-semibold rounded-xl [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-base"
              >
                {loading && (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? 'Resetting...' : 'Reset 2FA and continue'}
              </button>

              <button
                type="button"
                onClick={() => { setTotpUnreadable(false); setResetPassword(''); setError(null); }}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back
              </button>
            </div>
          ) : needs2FA ? (
            <div className="w-full space-y-4">
              {/* TOTP code input */}
              <div>
                <label htmlFor="totp-code" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Authentication Code
                </label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-4 py-4 min-h-[52px] text-center text-2xl font-mono tracking-[0.5em] text-slate-900 placeholder-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                />
              </div>

              {/* Trust device checkbox */}
              <label className="flex items-start gap-3 bg-slate-50 rounded-xl p-3.5 cursor-pointer border border-slate-100 hover:border-slate-200 transition-colors">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={e => setTrustDevice(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5 h-4 w-4"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Trust this device for 30 days</p>
                  <p className="text-xs text-slate-400 mt-0.5">You won&apos;t need to enter a code next time.</p>
                </div>
              </label>

              {/* Verify button */}
              <button
                type="button"
                onClick={handleVerify2FA}
                disabled={loading || totpCode.length !== 6}
                className="w-full py-4 min-h-[48px] bg-blue-500 text-white font-semibold rounded-xl [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-base"
              >
                {loading && (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? 'Verifying...' : 'Verify'}
              </button>

              {/* Back to login */}
              <button
                type="button"
                onClick={() => { setNeeds2FA(false); setTotpCode(''); setError(null); }}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to sign in
              </button>
            </div>
          ) : (

          /* Login form */
          <form className="w-full space-y-4" onSubmit={handleLogin}>
            {/* Email field */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Email
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  required
                  className="w-full pl-11 pr-4 py-4 min-h-[48px] border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  required
                  className="w-full pl-11 pr-11 py-4 min-h-[48px] border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 [@media(hover:hover)]:hover:text-slate-600 active:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg w-11 h-11 inline-flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              className="w-full py-4 min-h-[48px] mt-2 bg-blue-500 text-white font-semibold rounded-xl [@media(hover:hover)]:hover:bg-blue-600 active:bg-blue-600 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-base"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {biometricReady && biometricHas && (
              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={biometricBusy || loading}
                className="w-full py-3.5 min-h-[48px] mt-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A10.48 10.48 0 0112 3.75c1.51 0 2.947.317 4.243.867M4.243 7.864A10.48 10.48 0 003.75 12c0 1.51.317 2.947.867 4.243M20.25 12c0-1.51-.317-2.947-.867-4.243M7.864 19.757A10.48 10.48 0 0012 20.25c1.51 0 2.947-.317 4.243-.867M9.75 9.75a2.25 2.25 0 014.5 0v4.5a2.25 2.25 0 01-4.5 0v-4.5z" />
                </svg>
                {biometricBusy ? 'Waiting for Face ID…' : 'Sign in with Face ID'}
              </button>
            )}
          </form>
          )}

          {/* Divider */}
          <div className="w-full mt-6 pt-5 border-t border-slate-100 flex justify-center">
            <button
              onClick={handleBackClick}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-3 py-1.5 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to website
            </button>
          </div>
        </div>

        {/* Footer text below the card */}
        <p className="text-center text-xs text-white/40 mt-6">
          3Brothers Marketing &middot; Partner Portal
        </p>
      </div>

      {/* Inline styles for entry animation */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
