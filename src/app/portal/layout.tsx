import type { ReactNode } from 'react';
import PortalAuthGuard from '@/components/portal/PortalAuthGuard';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalAuthGuard />
      {children}
    </>
  );
}
