'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/layout/Logo';

// Account security hub: forced password change, 2FA enrollment, code
// verification, recovery codes. The server decides the step
// (GET /api/auth/onboarding); this page only renders it, so a reload always
// resumes in the right place.
type Step = 'loading' | 'password' | 'enroll-setup' | 'enroll-verify' | 'verify' | 'codes';
type Action = 'reenroll' | 'recovery-codes' | null;

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
const codeCls = 'w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
const primaryBtn = 'w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50';

export default function ChangePasswordPage() {
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);

  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesSaved, setCodesSaved] = useState(false);

  const landingRef = useRef('/portal');
  // What to do once a code prompt succeeds (step-up for a settings action).
  const pendingAction = useRef<Action>(null);

  const finish = useCallback(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    let dest = next && /^\/(?!\/)/.test(next) ? next : landingRef.current;
    // Phones can't fit the admin grid — same reroute as the login page.
    if (dest === '/admin/dashboard' && window.innerWidth < 640) dest = '/admin/market-visits';
    window.location.href = dest;
  }, []);

  const startSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST', credentials: 'include' });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403 && d.code === 'STEP_UP_REQUIRED') {
        pendingAction.current = 'reenroll';
        setNotice('Confirm a code from your current authenticator to continue.');
        setStep('verify');
        return;
      }
      if (!res.ok) {
        setError(d.error || 'Failed to set up 2FA. Please try again or contact support.');
        setStep('enroll-setup');
        return;
      }
      if (d.skipped) { finish(); return; }
      setQrCode(d.qrCode);
      setManualSecret(d.secret);
      setTotpCode('');
      setStep('enroll-setup');
    } catch {
      setError('Failed to set up 2FA. Please check your connection and try again.');
      setStep('enroll-setup');
    } finally {
      setLoading(false);
    }
  }, [finish]);

  const regenerateCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/recovery-codes', { method: 'POST', credentials: 'include' });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403 && d.code === 'STEP_UP_REQUIRED') {
        pendingAction.current = 'recovery-codes';
        setNotice('Confirm a code from your authenticator to create new recovery codes.');
        setStep('verify');
        return;
      }
      if (!res.ok) { setError(d.error || 'Could not generate recovery codes.'); return; }
      setRecoveryCodes(d.recoveryCodes || []);
      setCodesSaved(false);
      setStep('codes');
    } catch {
      setError('Could not generate recovery codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Ask the server what is next and go there.
  const advance = useCallback(async () => {
    setError(null);
    const res = await fetch('/api/auth/onboarding', { credentials: 'include' });
    if (!res.ok) { window.location.href = '/auth/login'; return; }
    const status = await res.json();
    if (status.landing) landingRef.current = status.landing;

    if (status.step === 'password') { setStep('password'); return; }
    if (status.step === 'enroll') { await startSetup(); return; }
    if (status.step === 'verify') {
      const t = await fetch('/api/auth/2fa/check-trusted', { credentials: 'include' });
      const td = t.ok ? await t.json() : null;
      if (!td?.trusted) { setStep('verify'); return; }
    }

    const action = new URLSearchParams(window.location.search).get('action');
    if (action === 'reenroll') { await startSetup(); return; }
    if (action === 'recovery-codes') { await regenerateCodes(); return; }
    finish();
  }, [finish, regenerateCodes, startSetup]);

  useEffect(() => { advance().catch(() => setError('Something went wrong. Please reload the page.')); }, [advance]);

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
        return;
      }
      await advance();
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollVerify = async () => {
    setError(null);
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: totpCode, trustDevice, enroll: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Invalid code.'); return; }
      setRecoveryCodes(d.recoveryCodes || []);
      setCodesSaved(false);
      setTotpCode('');
      setStep('codes');
    } catch {
      setError('Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const afterFactor = async () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setNotice(null);
    setTotpCode('');
    setRecoveryCode('');
    if (action === 'reenroll') { await startSetup(); return; }
    if (action === 'recovery-codes') { await regenerateCodes(); return; }
    await advance();
  };

  const handleVerify = async () => {
    setError(null);
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: totpCode, trustDevice }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Invalid code.');
        if (d.code === 'TOTP_UNREADABLE') setUseRecovery(true);
        return;
      }
      await afterFactor();
    } catch {
      setError('Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async () => {
    setError(null);
    if (!recoveryCode.trim()) { setError('Enter one of your recovery codes.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/recovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code: recoveryCode }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'That recovery code is not valid.'); return; }
      // A recovery code means the authenticator is gone — replace it now.
      pendingAction.current = 'reenroll';
      setUseRecovery(false);
      await afterFactor();
    } catch {
      setError('Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = async () => {
    try { await navigator.clipboard.writeText(recoveryCodes.join('\n')); setNotice('Copied to clipboard.'); } catch { /* clipboard blocked */ }
  };

  const title =
    step === 'password' ? 'Set Your Password'
    : step === 'verify' ? 'Verify It’s You'
    : step === 'codes' ? 'Save Your Recovery Codes'
    : step === 'loading' ? 'One moment…'
    : 'Set Up 2FA';

  const subtitle =
    step === 'password' ? 'Create a strong password for your account.'
    : step === 'enroll-setup' ? 'Two-factor authentication is required. Scan the QR code with an authenticator app.'
    : step === 'enroll-verify' ? 'Enter the code from your authenticator app.'
    : step === 'verify' ? (useRecovery ? 'Enter one of the recovery codes you saved when you set up 2FA.' : 'Enter the code from your authenticator app.')
    : step === 'codes' ? 'Each code works once if you lose your authenticator. They will not be shown again.'
    : '';

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4"><LogoMark size={48} /></div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-2">{subtitle}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {notice && step !== 'loading' && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">{notice}</p>
          )}

          {step === 'loading' && (error ? (
            <div className="space-y-4">
              <p className="text-sm text-red-600 font-medium">{error}</p>
              <button onClick={() => window.location.reload()} className={primaryBtn}>Try again</button>
            </div>
          ) : (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
            </div>
          ))}

          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required minLength={8} className={inputCls} />
              </div>
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? 'Updating...' : 'Set Password & Continue'}
              </button>
            </form>
          )}

          {step === 'enroll-setup' && (
            <div className="space-y-5">
              {!qrCode ? (
                <>
                  {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
                  <p className="text-sm text-slate-600">You will not be able to continue until 2FA is set up.</p>
                  <button onClick={startSetup} disabled={loading} className={primaryBtn}>
                    {loading ? 'Retrying...' : 'Retry 2FA setup'}
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                    <p className="font-semibold mb-1">Download an authenticator app</p>
                    <p className="text-blue-600">We recommend <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> — both are free on iOS and Android.</p>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-slate-600 font-medium">Scan this QR code with your authenticator app:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 border border-slate-200 rounded-xl p-2" />
                  </div>

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

                  <button onClick={() => { setError(null); setStep('enroll-verify'); }} className={primaryBtn}>
                    I&apos;ve scanned the QR code
                  </button>
                </>
              )}
            </div>
          )}

          {step === 'enroll-verify' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Enter 6-digit code</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
                  value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" autoFocus className={codeCls}
                />
              </div>
              <TrustDevice checked={trustDevice} onChange={setTrustDevice} />
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setStep('enroll-setup'); setTotpCode(''); setError(null); }} className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Back</button>
                <button onClick={handleEnrollVerify} disabled={loading || totpCode.length !== 6} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>
              </div>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              {useRecovery ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recovery code</label>
                  <input
                    type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                    value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)}
                    placeholder="XXXXX-XXXXX" autoFocus
                    className="w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-lg font-mono tracking-widest uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-2">After this you will set up a new authenticator. No codes left? Ask your administrator to reset your 2FA.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Enter 6-digit code</label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
                      value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000" autoFocus className={codeCls}
                    />
                  </div>
                  <TrustDevice checked={trustDevice} onChange={setTrustDevice} />
                </>
              )}
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
              <button
                onClick={useRecovery ? handleRecovery : handleVerify}
                disabled={loading || (useRecovery ? !recoveryCode.trim() : totpCode.length !== 6)}
                className={primaryBtn}
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={() => { setUseRecovery(!useRecovery); setError(null); }}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                {useRecovery ? 'Use my authenticator app instead' : 'Lost your authenticator? Use a recovery code'}
              </button>
            </div>
          )}

          {step === 'codes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-4">
                {recoveryCodes.map(c => (
                  <span key={c} className="font-mono text-sm text-slate-800 text-center select-all">{c}</span>
                ))}
              </div>
              <button onClick={copyCodes} className="w-full py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                Copy codes
              </button>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={codesSaved} onChange={e => setCodesSaved(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                <span className="text-sm text-slate-700">I have saved these codes somewhere safe.</span>
              </label>
              <button onClick={finish} disabled={!codesSaved} className={primaryBtn}>Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrustDevice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 bg-slate-50 rounded-lg p-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-slate-700">Trust this device</p>
        <p className="text-xs text-slate-400">You won&apos;t be asked for a code on this device for 90 days.</p>
      </div>
    </label>
  );
}
