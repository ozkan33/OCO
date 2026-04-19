'use client';

import { useState } from 'react';
import { LogoMark } from '@/components/layout/Logo';

type Step = 'password' | '2fa-retry' | '2fa-setup' | '2fa-verify' | 'done';

export default function ChangePasswordPage() {
  const [step, setStep] = useState<Step>('password');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // True once the password-change POST succeeded. If 2FA setup then fails we
  // want the user to retry enrollment, NOT re-enter a new password (which would
  // fail or re-trigger reauth). Middleware still blocks /portal until enroll.
  const [passwordChanged, setPasswordChanged] = useState(false);

  // 2FA state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to update password.');
        setLoading(false);
        return;
      }

      // Password change committed.
      setPasswordChanged(true);

      // Password changed — check if 2FA is enabled, otherwise skip to done
      const tfaCheck = await fetch('/api/auth/2fa/setup', { credentials: 'include' });
      const tfaData = tfaCheck.ok ? await tfaCheck.json() : null;
      if (tfaData?.skipped) {
        // 2FA feature flag is off — go straight to portal
        window.location.href = '/portal';
        return;
      }
      // NOTE: if 2FA setup POST fails inside setup2FA, the user stays on this page
      // with an actionable error message. Middleware's must_enroll_2fa guard keeps
      // them here across refreshes — they cannot accidentally reach /portal without
      // completing enrollment. See src/middleware.ts and the must_enroll_2fa flag
      // set in src/app/api/admin/brand-users/route.ts.
      await setup2FA();
    } catch {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  const setup2FA = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) {
        // Surface the server's real error. A 503 with TOTP_KEY_MISSING means the
        // server is misconfigured (TOTP_ENCRYPTION_KEY not set) and the admin has
        // to fix env vars — nothing the user can do. Older code just said "Failed
        // to create 2FA" which was uselessly generic.
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to set up 2FA. Please try again or contact support.');
        // Drop into the retry step so the user has an explicit retry button and
        // understands the password already committed. Without this they'd be
        // looking at the (now-irrelevant) password form.
        if (passwordChanged) setStep('2fa-retry');
        return;
      }
      const data = await res.json();
      setQrCode(data.qrCode);
      setManualSecret(data.secret);
      setStep('2fa-setup');
    } catch {
      setError('Failed to set up 2FA. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setError(null);
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: totpCode, trustDevice }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Invalid code.'); setLoading(false); return; }
      setStep('done');
    } catch { setError('Verification failed.'); } finally { setLoading(false); }
  };

  const stepNumber = step === 'password' ? 1 : step === '2fa-retry' ? 2 : step === '2fa-setup' ? 2 : step === '2fa-verify' ? 3 : 3;

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4"><LogoMark size={48} /></div>
          <h1 className="text-2xl font-bold text-slate-900">
            {step === 'password' ? 'Set Your Password' : step === 'done' ? 'All Set!' : step === '2fa-retry' ? '2FA Setup Failed' : 'Set Up 2FA'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {step === 'password' && 'Create a strong password for your account.'}
            {step === '2fa-retry' && 'Your password was saved, but two-factor setup failed. You must complete 2FA before accessing the portal.'}
            {step === '2fa-setup' && 'Scan the QR code with an authenticator app.'}
            {step === '2fa-verify' && 'Enter the code from your authenticator app.'}
            {step === 'done' && 'Your account is secured. You can now access your portal.'}
          </p>
        </div>

        {/* Progress steps */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${s < stepNumber ? 'bg-green-500 text-white' : s === stepNumber ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {s < stepNumber ? '✓' : s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 ${s < stepNumber ? 'bg-green-500' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {/* Step 1: Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required minLength={8} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {loading ? 'Updating...' : 'Set Password & Continue'}
              </button>
            </form>
          )}

          {/* Step 2 (retry): 2FA setup POST failed after password commit.
              Give the user an explicit retry button instead of leaving them
              staring at the password form with a confusing error. */}
          {step === '2fa-retry' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">Password saved.</p>
                <p className="text-amber-700">
                  We could not start two-factor enrollment. This usually means the
                  server is missing a required configuration value
                  (<code className="font-mono text-xs">TOTP_ENCRYPTION_KEY</code>).
                  Please try again in a moment, or contact support if the problem
                  persists. You will not be able to reach the portal until 2FA is
                  enrolled.
                </p>
              </div>
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              <button onClick={setup2FA} disabled={loading} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {loading ? 'Retrying...' : 'Retry 2FA setup'}
              </button>
            </div>
          )}

          {/* Step 2: 2FA Setup — QR code */}
          {step === '2fa-setup' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Download an authenticator app</p>
                <p className="text-blue-600">We recommend <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> — both are free on iOS and Android.</p>
              </div>

              {qrCode && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-slate-600 font-medium">Scan this QR code with your authenticator app:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 border border-slate-200 rounded-xl p-2" />
                </div>
              )}

              {/* Manual key toggle */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setShowManualKey(!showManualKey)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
                  <span>Can&apos;t scan? Enter key manually</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showManualKey ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {showManualKey && manualSecret && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-100">
                    <p className="font-mono text-sm text-slate-800 bg-slate-50 rounded px-3 py-2 select-all break-all">{manualSecret}</p>
                  </div>
                )}
              </div>

              <button onClick={() => setStep('2fa-verify')} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                I&apos;ve scanned the QR code
              </button>
            </div>
          )}

          {/* Step 3: Verify 2FA code */}
          {step === '2fa-verify' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Enter 6-digit code</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" autoFocus
                  className="w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Trust device */}
              <label className="flex items-start gap-3 bg-slate-50 rounded-lg p-3 cursor-pointer">
                <input type="checkbox" checked={trustDevice} onChange={e => setTrustDevice(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Trust this device</p>
                  <p className="text-xs text-slate-400">You won&apos;t be asked for 2FA on this device for 30 days.</p>
                </div>
              </label>

              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setStep('2fa-setup'); setTotpCode(''); setError(null); }} className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Back</button>
                <button onClick={handleVerify2FA} disabled={loading || totpCode.length !== 6} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Verifying...' : 'Verify & Complete'}
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Account Secured</p>
                <p className="text-sm text-slate-500 mt-1">Your password and two-factor authentication are set up.</p>
              </div>
              <button onClick={() => window.location.href = '/portal'} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                Go to Portal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
