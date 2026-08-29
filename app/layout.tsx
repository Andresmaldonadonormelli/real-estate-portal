import MainLayout from '@/components/layout/MainLayout';
import AuthGate from '@/components/auth/AuthGate';
import './globals.css';

export const metadata = {
  title: 'Real Estate Owner Portal',
  description: 'Manage your rental properties',
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
