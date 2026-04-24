import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ClientLayout from './ClientLayout';
import { MobileErrorBoundary } from '@/components/ui/MobileErrorBoundary';
import { SafariErrorBoundary } from '@/components/ui/SafariErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://3brothersmarketing.com'),
  title: {
    default: '3Brothers Marketing',
    template: '%s | 3Brothers Marketing',
  },
  description: 'Boutique CPG sales brokerage helping emerging food & beverage brands win shelf space across Minnesota, Wisconsin, Michigan, North Dakota & South Dakota. 5,400+ retail doors. Retail execution, buyer relationships, and category management.',
  keywords: [
    'CPG sales brokerage', 'CPG broker', 'CPG sales agency', 'food broker midwest',
    'beverage broker', 'retail brokerage', 'grocery broker Minnesota',
    'food and beverage sales', 'shelf space', 'retail execution',
    'category management', 'CPG brand growth', 'emerging brands',
    'natural food broker', 'specialty food distributor',
    'Minnesota food broker', 'Wisconsin food broker', 'Michigan food broker',
    'North Dakota food broker', 'South Dakota food broker',
    'Upper Midwest CPG', 'store visits', 'retail audit',
    'CPG brand launch', 'grocery store placement', 'food distribution midwest',
    'beverage distribution', 'retail shelf placement', 'food sales representative',
    'CPG consulting', 'food broker Minneapolis', 'grocery broker upper midwest',
    'emerging food brand', 'natural product broker', 'organic food broker',
    'health food broker', 'snack broker midwest', 'frozen food broker',
    '3Brothers Marketing', '3 Brothers Marketing',
  ],
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
  },
  openGraph: {
    title: '3Brothers Marketing | CPG Sales Brokerage — Midwest Food & Beverage',
    description: 'Boutique CPG sales brokerage for emerging food & beverage brands. 5,400+ retail doors across MN, WI, MI, ND & SD. Retail execution, buyer relationships, and category management.',
    url: 'https://3brothersmarketing.com',
    siteName: '3Brothers Marketing',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: '3Brothers Marketing — CPG Sales Brokerage for Midwest Food & Beverage Brands',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '3Brothers Marketing | CPG Sales Brokerage',
    description: 'Boutique CPG sales brokerage for emerging food & beverage brands. 5,400+ retail doors across the Upper Midwest.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://3brothersmarketing.com',
  },
  verification: {
    google: 'google65702f61a8048f66',
  },
  category: 'business',
  other: {
    'geo.region': 'US-MN',
    'geo.placename': 'Minneapolis',
    'geo.position': '44.9778;-93.2650',
    'ICBM': '44.9778, -93.2650',
  },
};

// Per-surface PWA wiring. The marketing site at "/" keeps the existing
// /manifest.json. Admin and portal each get their own scoped manifest +
// apple-touch-icon so installed PWAs land in the right surface with the
// right launcher icon. Path is read from middleware-set x-pathname (not
// in stock Next 15) with fallbacks to the standard `next-url` /
// `x-invoke-path` headers and finally the referer.
async function resolveSurface(): Promise<'admin' | 'portal' | 'marketing'> {
  try {
    const h = await headers();
    const path =
      h.get('x-pathname') ||
      h.get('next-url') ||
      h.get('x-invoke-path') ||
      (() => {
        const ref = h.get('referer');
        if (!ref) return '';
        try { return new URL(ref).pathname; } catch { return ''; }
      })();
    // Use exact-or-slash match so "/administration" or "/portal-something"
    // can't accidentally adopt the admin/portal manifest.
    if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
    if (path === '/portal' || path.startsWith('/portal/')) return 'portal';
    return 'marketing';
  } catch {
    return 'marketing';
  }
}

const SURFACE_META: Record<'admin' | 'portal' | 'marketing', {
  manifest: string;
  themeColor: string;
  appleTitle: string;
  appleIcon: string;
}> = {
  admin: {
    manifest: '/manifest-admin.webmanifest',
    themeColor: '#0f172a',
    appleTitle: '3Brothers Marketing',
    appleIcon: '/icons/admin-192.png',
  },
  portal: {
    manifest: '/manifest-portal.webmanifest',
    themeColor: '#2563eb',
    appleTitle: '3Brothers Portal',
    appleIcon: '/icons/portal-192.png',
  },
  marketing: {
    manifest: '/manifest.json',
    themeColor: '#3b82f6',
    appleTitle: '3Brothers Marketing',
    appleIcon: '/logo.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const surface = await resolveSurface();
  const m = SURFACE_META[surface];

  return (
    <html lang="en">
      <head>
        {/* `interactive-widget=resizes-content` (iOS 16.4+, Chrome 108+) makes the
            software keyboard shrink the layout viewport so 100dvh tracks the visible
            area when the keyboard is up. Older iOS ignores it — the comment drawers
            fall back to a visualViewport effect. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href={m.appleIcon} />
        <link rel="manifest" href={m.manifest} />
        <meta name="theme-color" content={m.themeColor} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={m.appleTitle} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <SafariErrorBoundary>
          <MobileErrorBoundary>
            <ClientLayout>{children}</ClientLayout>
          </MobileErrorBoundary>
        </SafariErrorBoundary>
      </body>
    </html>
  );
}