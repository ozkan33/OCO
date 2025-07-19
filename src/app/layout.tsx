import type { Metadata } from 'next';
import ClientLayout from './ClientLayout';
import { MobileErrorBoundary } from '@/components/ui/MobileErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: '3Brothers',
  description: '3Brothers Vendor Portal for managing orders and inventory',
  icons: {
    icon: 'https://i.hizliresim.com/rm69m47.png',
    shortcut: 'https://i.hizliresim.com/rm69m47.png',
    apple: 'https://i.hizliresim.com/rm69m47.png',
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
        <MobileErrorBoundary>
          <ClientLayout>{children}</ClientLayout>
        </MobileErrorBoundary>
      </body>
    </html>
  );
} 