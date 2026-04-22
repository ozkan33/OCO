'use client';

// Security settings for non-admin portal users (BRAND / VENDOR).
//
// /admin/settings is admin-only (middleware enforces admin:access, plus the
// page itself gates on role === 'ADMIN'), so portal users had no surface to
// enroll, list, or revoke passkeys. This page exposes just the passkey
// section to them — 2FA is already handled during the onboarding flow at
// /auth/change-password, so we don't re-surface it here.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { FiArrowLeft, FiKey, FiCheck, FiX, FiTrash2, FiShield } from 'react-icons/fi';
import {
  isBiometricSupported,
  enrollPasskey,
  listPasskeys,
  revokePasskey,
  type PasskeyRow,
} from '@/lib/webauthn/client';

export default function PortalSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [enrollingPasskey, setEnrollingPasskey] = useState(false);
  // Matches the admin-settings guard: state updates don't flush before a
  // rapid second click, so a ref blocks re-entry into the register flow.
  const enrollingPasskeyRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" richColors />

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href="/portal"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <div className="ml-1">
            <h1 className="text-base font-semibold text-slate-900 leading-tight">Settings</h1>
            <p className="text-xs text-slate-500 leading-tight">Account security</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FiShield className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Security</h2>
          </div>

          <div className="px-6 py-5">
            {!passkeySupported ? (
              <div className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3.5">
                Biometric sign-in isn&apos;t available on this device or browser. Install the PWA on your phone or use a modern browser to enable Face ID, Touch ID, or Windows Hello.
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
