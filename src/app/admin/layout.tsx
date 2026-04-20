import type { ReactNode } from 'react';
import AdminInstallBanner from '@/components/pwa/AdminInstallBanner';

/**
 * Admin layout wrapper.
 *
 * Introduced in PWA Phase 2 to host the admin install banner. The banner
 * is a client component that self-gates visibility (authenticated admin,
 * iPad, just-logged-in flag, no active dismissal cooldown, not already
 * installed), so mounting it unconditionally here is safe — it renders
 * nothing on all the wrong conditions.
 *
 * Server component. Keep it that way unless a future phase requires
 * client-side state at the layout level.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminInstallBanner />
      {children}
    </>
  );
}
