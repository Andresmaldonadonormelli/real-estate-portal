'use client';

import { useState, useEffect } from 'react';
import BottomNav from './BottomNav';
import SideNav from './SideNav';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [showNav, setShowNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isMobile && <SideNav />}

      <main className="main-content" style={{ background: 'var(--bg-primary)' }}>
        {children}
      </main>

      {isMobile && <BottomNav onMenuClick={() => setShowNav(!showNav)} />}
    </div>
  );
}
