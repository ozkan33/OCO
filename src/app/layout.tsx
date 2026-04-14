import type { Metadata } from 'next';
import ClientLayout from './ClientLayout';
import { MobileErrorBoundary } from '@/components/ui/MobileErrorBoundary';
import { SafariErrorBoundary } from '@/components/ui/SafariErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: '3Brothers Marketing | CPG Sales Brokerage — Midwest Food & Beverage',
  description: 'Boutique CPG sales brokerage for emerging food & beverage brands. We help brands win shelf space across Minnesota, Wisconsin, Michigan, North Dakota & South Dakota with retail execution, buyer relationships, and category management.',
  keywords: [
    'CPG sales brokerage', 'CPG broker', 'CPG sales agency', 'food broker midwest',
    'beverage broker', 'retail brokerage', 'grocery broker Minnesota',
    'food and beverage sales', 'shelf space', 'retail execution',
    'category management', 'CPG brand growth', 'emerging brands',
    'natural food broker', 'specialty food distributor',
    'Minnesota food broker', 'Wisconsin food broker', 'Michigan food broker',
    'Upper Midwest CPG', 'store visits', 'retail audit',
    '3Brothers Marketing', '3 Brothers Marketing',
  ],
  icons: {
    icon: 'https://i.hizliresim.com/rm69m47.png',
    shortcut: 'https://i.hizliresim.com/rm69m47.png',
    apple: 'https://i.hizliresim.com/rm69m47.png',
  },
  openGraph: {
    title: '3Brothers Marketing | CPG Sales Brokerage',
    description: 'Boutique CPG sales brokerage for emerging food & beverage brands. Retail execution, buyer relationships, and category management across the Upper Midwest.',
    url: 'https://3brothersmarketing.com',
    siteName: '3Brothers Marketing',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://i.hizliresim.com/rm69m47.png', width: 512, height: 512, alt: '3Brothers Marketing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '3Brothers Marketing | CPG Sales Brokerage',
    description: 'Boutique CPG sales brokerage for emerging food & beverage brands across the Upper Midwest.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: 'https://3brothersmarketing.com',
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
        <link rel="icon" href="https://i.hizliresim.com/rm69m47.png" />
        <link rel="shortcut icon" href="https://i.hizliresim.com/rm69m47.png" />
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