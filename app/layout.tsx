import type { Metadata, Viewport } from 'next';
import MainLayout from '@/components/layout/MainLayout';
import AuthGate from '@/components/auth/AuthGate';
import './globals.css';
import './product-system.css';

const themeInitScript = `(function(){try{var saved=localStorage.getItem('theme');var choice=saved==='light'||saved==='dark'||saved==='system'?saved:'system';var resolved=choice==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):choice;var root=document.documentElement;root.setAttribute('data-theme',resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'RE Portal',
  description: 'Manage your rental properties',
  applicationName: 'RE Portal',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthGate><MainLayout>{children}</MainLayout></AuthGate>
      </body>
    </html>
  );
}
