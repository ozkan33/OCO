'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [recoveryLeft, setRecoveryLeft] = useState<number | null>(null);

  // Passkey / biometric state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [enrollingPasskey, setEnrollingPasskey] = useState(false);
  // Ref guard: setEnrollingPasskey won't flush before a rapid double-click
  // can re-enter the handler and issue a second register/challenge request.
  const enrollingPasskeyRef = useRef(false);

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
          setRecoveryLeft(typeof setupData.recoveryCodesRemaining === 'number' ? setupData.recoveryCodesRemaining : null);
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
    if (enrollingPasskeyRef.current) return;
    enrollingPasskeyRef.current = true;
    setEnrollingPasskey(true);
    try {
      await enrollPasskey();
      toast.success('Passkey added — you can now sign in with Face ID.');
      try { setPasskeys(await listPasskeys()); } catch {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add passkey');
    } finally {
      setEnrollingPasskey(false);
      enrollingPasskeyRef.current = false;
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
                  <p className="text-xs text-slate-500 mt-0.5">Required for every account. Recognized devices are not asked for a code for 90 days.</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {twoFAEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <FiCheck className="w-3 h-3" /> Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        <FiX className="w-3 h-3" /> Not set up
                      </span>
                    )}
                    {twoFAEnabled && recoveryLeft !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${recoveryLeft <= 2 ? 'text-amber-700 bg-amber-50' : 'text-slate-500 bg-slate-100'}`}>
                        {recoveryLeft} recovery code{recoveryLeft === 1 ? '' : 's'} left
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-2">
                <a
                  href="/auth/change-password?action=reenroll&next=/admin/settings"
                  className="px-4 py-2 text-sm font-medium text-center text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  New authenticator
                </a>
                <a
                  href="/auth/change-password?action=recovery-codes&next=/admin/settings"
                  className="px-4 py-2 text-sm font-medium text-center text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  New recovery codes
                </a>
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
