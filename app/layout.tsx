import type { Metadata, Viewport } from 'next';
import MainLayout from '@/components/layout/MainLayout';
import AuthGate from '@/components/auth/AuthGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'RE Portal',
  description: 'Manage your rental properties',
  applicationName: 'RE Portal',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'RE Portal',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0b0c' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthGate><MainLayout>{children}</MainLayout></AuthGate>
      </body>
    </html>
  );
}
