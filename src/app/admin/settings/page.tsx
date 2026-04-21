'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import { FiShield, FiSmartphone, FiCheck, FiX, FiInfo, FiKey, FiTrash2 } from 'react-icons/fi';
import { toast, Toaster } from 'sonner';
import {
  isBiometricSupported,
  enrollPasskey,
  listPasskeys,
  revokePasskey,
  type PasskeyRow,
} from '@/lib/webauthn/client';

export default function AdminSettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [enabling, setEnabling] = useState(false);

  // Passkey / biometric state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [enrollingPasskey, setEnrollingPasskey] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        setUser(data.user);
        // Check 2FA status
        const setupRes = await fetch('/api/auth/2fa/setup', { credentials: 'include' });
        if (setupRes.ok) {
          const setupData = await setupRes.json();
          setTwoFAEnabled(setupData.enabled || false);
        }
        // Check biometric / passkey support and load enrolled credentials
        const supported = await isBiometricSupported();
        setPasskeySupported(supported);
        if (supported) {
          try { setPasskeys(await listPasskeys()); } catch {}
        }
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  const handleEnrollPasskey = async () => {
    if (enrollingPasskey) return;
    setEnrollingPasskey(true);
    try {
      await enrollPasskey();
      toast.success('Passkey added — you can now sign in with Face ID.');
      try { setPasskeys(await listPasskeys()); } catch {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add passkey');
    } finally {
      setEnrollingPasskey(false);
    }
  };

  const handleRevokePasskey = async (id: string) => {
    if (!confirm('Remove this passkey? You will need a password to sign in on that device.')) return;
    try {
      await revokePasskey(id);
      setPasskeys(prev => prev.filter(p => p.id !== id));
      toast.success('Passkey removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove passkey');
    }
  };

  const handleEnable2FA = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error('Failed to initialize 2FA setup');
        return;
      }
      const data = await res.json();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setShowSetup(true);
    } catch {
      toast.error('Failed to start 2FA setup');
    } finally {
      setEnabling(false);
    }
  };

  const handleVerify2FA = async () => {
    if (verifyCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Invalid code. Please try again.');
        setVerifying(false);
        return;
      }
      setTwoFAEnabled(true);
      setShowSetup(false);
      setVerifyCode('');
      toast.success('Two-factor authentication enabled!');
    } catch {
      toast.error('Verification failed');
    }
    setVerifying(false);
  };

  const handleDisable2FA = async () => {
    const password = prompt('Enter your password to disable 2FA:');
    if (!password) return;
    setDisabling(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to disable 2FA');
        setDisabling(false);
        return;
      }
      setTwoFAEnabled(false);
      setShowSetup(false);
      toast.success('Two-factor authentication disabled');
    } catch {
      toast.error('Failed to disable 2FA');
    }
    setDisabling(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-red-200 text-slate-700 px-6 py-5 rounded-xl shadow-sm max-w-md">
          <strong className="font-semibold text-slate-900">Unauthorized</strong>
          <p className="text-sm text-slate-600 mt-1">You do not have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" richColors />

      <AdminHeader />

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your account security and preferences.</p>
        </div>

        {/* Security Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FiShield className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Security</h2>
          </div>

          <div className="px-6 py-5">
            {/* 2FA Section */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FiSmartphone className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Two-Factor Authentication</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Add an extra layer of security using an authenticator app like Google Authenticator or Authy.</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {twoFAEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <FiCheck className="w-3 h-3" /> Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        <FiX className="w-3 h-3" /> Disabled
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                {twoFAEnabled ? (
                  <button
                    onClick={handleDisable2FA}
                    disabled={disabling}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {disabling ? 'Disabling...' : 'Disable'}
                  </button>
                ) : (
                  <button
                    onClick={handleEnable2FA}
                    disabled={enabling}
                    aria-busy={enabling}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                  >
                    {enabling ? 'Starting…' : 'Enable'}
                  </button>
                )}
              </div>
            </div>

            {/* Passkey / Face ID Section */}
            {passkeySupported && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FiKey className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Biometric Sign-In</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Sign in with Face ID, Touch ID, or Windows Hello on devices you control.</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        {passkeys.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <FiCheck className="w-3 h-3" /> {passkeys.length} enrolled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <FiX className="w-3 h-3" /> Not enrolled
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={handleEnrollPasskey}
                      disabled={enrollingPasskey}
                      aria-busy={enrollingPasskey}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                    >
                      {enrollingPasskey ? 'Waiting…' : passkeys.length > 0 ? 'Add another' : 'Enable'}
                    </button>
                  </div>
                </div>

                {passkeys.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {passkeys.map(p => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {p.device_label || 'Unknown device'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Added {new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            {p.last_used_at ? ` · last used ${new Date(p.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokePasskey(p.id)}
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-100 rounded-md hover:bg-red-50 transition-colors"
                          aria-label={`Remove passkey ${p.device_label || ''}`}
                        >
                          <FiTrash2 className="w-3 h-3" /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 2FA Setup Flow */}
            {showSetup && !twoFAEnabled && (
              <div className="mt-6 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Set up authenticator app</h4>
                <ol className="text-xs text-slate-600 space-y-2 mb-4 list-decimal list-inside">
                  <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
                  <li>Scan the QR code below with your app</li>
                  <li>Enter the 6-digit code from your app to verify</li>
                </ol>

                {qrCode && (
                  <div className="flex flex-col items-center gap-4 mb-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-1">Or enter this key manually:</p>
                      <code className="text-xs bg-slate-100 px-3 py-1.5 rounded font-mono text-slate-700 select-all">{secret}</code>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleVerify2FA()}
                  />
                  <button
                    onClick={handleVerify2FA}
                    disabled={verifying || verifyCode.length !== 6}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {verifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
                <button
                  onClick={() => { setShowSetup(false); setVerifyCode(''); }}
                  className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel setup
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Version Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FiInfo className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">About</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Application Version</h3>
                <p className="text-xs text-slate-500 mt-0.5">Current build deployed to production.</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg">
                  v{process.env.NEXT_PUBLIC_APP_VERSION || '2.2.0'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Build {process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}
                  {' · '}
                  {process.env.NEXT_PUBLIC_BUILD_TIME
                    ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : 'local'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
