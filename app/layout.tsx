import MainLayout from '@/components/layout/MainLayout';
import AuthGate from '@/components/auth/AuthGate';
import './globals.css';

export const metadata = {
  title: 'RE Portal',
  description: 'Manage your rental properties',
  icons: { icon: '/icon.svg' },
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
