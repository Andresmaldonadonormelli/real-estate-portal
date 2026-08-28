import MainLayout from '@/components/layout/MainLayout';
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
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
