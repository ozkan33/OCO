import type { Metadata } from 'next';
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
    apple: '/logo.png',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
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